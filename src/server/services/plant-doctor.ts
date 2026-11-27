import "server-only";

import { Types } from "mongoose";

import { getProducts } from "@/data/catalog";
import {
  type Diagnosis,
  type DiagnosisRecord,
  type DiagnosisSummary,
  type HealthLevel,
  MAX_NOTES_LENGTH,
} from "@/lib/plant-doctor";
import type { Product } from "@/lib/types";
import {
  analysePlantPhoto,
  researchProblem,
  type CatalogLine,
  type ModelOutput,
  type ResearchOutput,
} from "@/server/ai/plant-doctor";
import { prepareImage } from "@/server/ai/image";
import { aiEnv, aiProvider } from "@/server/config/env";
import { connectDb } from "@/server/db/connection";
import { PlantDiagnosis } from "@/server/db/models/plant-diagnosis";
import { AppError, notFound } from "@/server/http/errors";
import { logger } from "@/server/logger";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { rateLimiter } from "@/server/ratelimit";

const RETENTION_MS = 183 * 24 * 3600 * 1000;
const MAX_PRODUCTS = 4;
const DAY = 86_400;
/** The whole request must finish inside the route maxDuration; research gets only what is left of this. */
const RESEARCH_DEADLINE_MS = 100_000;

/** What is stored: the diagnosis with each product reduced to its handle, so prices and stock are read live later. */
type StoredDiagnosis = Omit<Diagnosis, "products"> & {
  products: { handle: string; reason: string }[];
};

const short = (value: string, max: number) => value.replace(/\s+/g, " ").trim().slice(0, max);
const list = (values: string[], count: number, max: number) =>
  values
    .map((v) => short(v, max))
    .filter(Boolean)
    .slice(0, count);

/** Customer notes: plain text only, no control characters, bounded length. */
export function cleanNotes(raw: string | null | undefined): string {
  if (!raw) return "";
  return [...raw]
    .filter((ch) => ch === "\n" || (ch.charCodeAt(0) > 31 && ch !== "\u007f"))
    .join("")
    .trim()
    .slice(0, MAX_NOTES_LENGTH);
}

/**
 * Turns the model's answer into what a customer may see: shortened, and with every product suggestion checked
 * against the real catalogue (unknown, sold-out and repeated handles are dropped, so nothing is ever invented).
 */
export function toStored(output: ModelOutput, catalog: Product[]): StoredDiagnosis {
  const bySlug = new Map(catalog.map((p) => [p.slug, p]));
  const seen = new Set<string>();
  const picks: StoredDiagnosis["products"] = [];
  for (const pick of output.productPicks) {
    const product = bySlug.get(pick.handle);
    if (!product || !product.inStock || seen.has(product.slug)) continue;
    seen.add(product.slug);
    picks.push({ handle: product.slug, reason: short(pick.reason, 200) });
    if (picks.length === MAX_PRODUCTS) break;
  }
  const noPlant = !output.isPlant;
  return {
    isPlant: output.isPlant,
    photoIssue: output.photoIssue ? short(output.photoIssue, 300) : null,
    plant: output.plant
      ? {
          commonName: short(output.plant.commonName, 80),
          scientificName: output.plant.scientificName
            ? short(output.plant.scientificName, 80)
            : null,
          confidence: output.plant.confidence,
        }
      : null,
    health: noPlant ? "unclear" : output.health,
    summary: short(output.summary, 500),
    findings: noPlant
      ? []
      : output.findings.slice(0, 4).map((f) => ({
          title: short(f.title, 100),
          kind: f.kind,
          confidence: f.confidence,
          severity: f.severity,
          evidence: short(f.evidence, 300),
          likelyCauses: list(f.likelyCauses, 4, 160),
        })),
    carePlan: {
      rightNow: list(output.carePlan.rightNow, 6, 220),
      thisWeek: list(output.carePlan.thisWeek, 6, 220),
      ongoing: list(output.carePlan.ongoing, 6, 220),
      avoid: list(output.carePlan.avoid, 5, 220),
    },
    watchFor: list(output.watchFor, 5, 200),
    prevention: list(output.prevention, 5, 200),
    questions: list(output.questions, 4, 200),
    whenToGetHelp: output.whenToGetHelp ? short(output.whenToGetHelp, 300) : null,
    products: noPlant ? [] : picks,
  };
}

/** A web lookup is worth its time only when a disease, pest or feeding problem is suspected, or the plant is in trouble. */
export function needsResearch(stored: StoredDiagnosis): boolean {
  if (!stored.isPlant || stored.health === "healthy" || stored.health === "unclear") return false;
  return (
    stored.health === "urgent" ||
    stored.findings.some(
      (f) => ["disease", "pest", "nutrition"].includes(f.kind) && f.confidence !== "low",
    )
  );
}

const describeProblem = (stored: StoredDiagnosis, notes: string): string =>
  [
    stored.plant ? `Plant: ${stored.plant.commonName}` : "Plant: unidentified houseplant",
    ...stored.findings.map((f) => `Suspected: ${f.title} (${f.kind}); ${f.evidence}`),
    notes ? `Customer notes: ${notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");

/** Adds the web findings to the stored diagnosis, plus any catalogue products the research picked (checked against the catalogue). */
export function mergeResearch(
  stored: StoredDiagnosis,
  research: ResearchOutput,
  catalog: Product[],
): StoredDiagnosis {
  const bySlug = new Map(catalog.map((p) => [p.slug, p]));
  const products = [...stored.products];
  for (const pick of research.productPicks) {
    const product = bySlug.get(pick.handle);
    if (!product || !product.inStock || products.some((p) => p.handle === product.slug)) continue;
    if (products.length >= MAX_PRODUCTS) break;
    products.push({ handle: product.slug, reason: short(pick.reason, 200) });
  }
  return {
    ...stored,
    products,
    research: {
      tips: list(research.tips, 5, 220),
      treatments: research.treatments.slice(0, 3).map((t) => ({
        name: short(t.name, 80),
        about: short(t.about, 220),
        safety: short(t.safety, 220),
      })),
      sources: research.sources,
    },
  };
}

async function hydrate(stored: StoredDiagnosis): Promise<Diagnosis> {
  const bySlug = new Map((await getProducts()).map((p) => [p.slug, p]));
  return {
    ...stored,
    products: stored.products.flatMap((pick) => {
      const product = bySlug.get(pick.handle);
      return product ? [{ product, reason: pick.reason }] : [];
    }),
  };
}

const catalogLines = (products: Product[]): CatalogLine[] =>
  products.map((p) => ({
    handle: p.slug,
    name: p.name,
    category: p.category,
    price: p.price,
    inStock: p.inStock,
  }));

/** Whether the feature can run at all, for the screens to show "coming soon" instead of a broken form. */
export function plantDoctorEnabled(): boolean {
  return aiProvider() !== null;
}

async function enforceLimits(userId: string, ip: string): Promise<void> {
  const { PLANT_DOCTOR_PER_USER_DAILY, PLANT_DOCTOR_DAILY_CAP } = aiEnv();
  await enforceRateLimit(`plant-doctor:burst:${userId}`, 3, 60);
  const daily = await rateLimiter.consume(
    `plant-doctor:user:${userId}`,
    PLANT_DOCTOR_PER_USER_DAILY,
    DAY,
  );
  if (!daily.allowed) {
    throw new AppError(
      429,
      "plant_doctor_daily_limit",
      `You've used your ${PLANT_DOCTOR_PER_USER_DAILY} free plant checks for today. Please come back tomorrow.`,
      { "Retry-After": String(daily.retryAfterSeconds) },
    );
  }
  await enforceRateLimit(`plant-doctor:ip:${ip}`, 40, DAY);
  // A site-wide ceiling: a bug or an attack can never run up an unlimited bill.
  const global = await rateLimiter.consume("plant-doctor:global", PLANT_DOCTOR_DAILY_CAP, DAY);
  if (!global.allowed) {
    throw new AppError(
      503,
      "plant_doctor_busy",
      "The Plant Doctor is very busy today. Please try again tomorrow.",
    );
  }
}

/** Full flow for one photo: clean it, check limits, ask the model, ground the answer, remember it, return it. */
export async function diagnose(input: {
  userId: string;
  ip: string;
  image: Uint8Array;
  notes: string | null | undefined;
}): Promise<DiagnosisRecord> {
  if (!plantDoctorEnabled()) {
    throw new AppError(
      503,
      "plant_doctor_not_configured",
      "The Plant Doctor isn't switched on yet.",
    );
  }
  // Cheap checks first, so a bad upload never uses a customer's daily allowance.
  const { jpeg } = await prepareImage(input.image);
  await enforceLimits(input.userId, input.ip);

  const catalog = await getProducts();
  const started = Date.now();
  let result;
  try {
    result = await analysePlantPhoto({
      jpeg,
      notes: cleanNotes(input.notes),
      catalog: catalogLines(catalog),
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error(
      { err: error instanceof Error ? error.message : String(error), ms: Date.now() - started },
      "Plant Doctor analysis failed",
    );
    throw new AppError(
      503,
      "plant_doctor_unavailable",
      "The Plant Doctor couldn't look at your photo just now. Please try again in a moment.",
    );
  }

  let stored = toStored(result.output, catalog);
  // Web research is a bonus: skipped when the photo check already used most of the time, and never allowed to fail the check.
  const budgetLeft = RESEARCH_DEADLINE_MS - (Date.now() - started);
  if (needsResearch(stored) && budgetLeft > 12_000) {
    const research = await researchProblem({
      problem: describeProblem(stored, cleanNotes(input.notes)),
      catalog: catalogLines(catalog),
      timeoutMs: Math.min(40_000, budgetLeft),
    });
    if (research) stored = mergeResearch(stored, research, catalog);
  }
  await connectDb();
  const now = new Date();
  const doc = await PlantDiagnosis.create({
    userId: new Types.ObjectId(input.userId),
    plantName: stored.plant?.commonName ?? "Unidentified plant",
    health: stored.health,
    summary: stored.summary,
    result: stored,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    createdAt: now,
    expireAt: new Date(now.getTime() + RETENTION_MS),
  });
  logger.info(
    {
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      ms: Date.now() - started,
      health: stored.health,
    },
    "Plant Doctor check done",
  );
  return { id: String(doc._id), createdAt: now.toISOString(), diagnosis: await hydrate(stored) };
}

export async function listChecks(userId: string, limit = 20): Promise<DiagnosisSummary[]> {
  await connectDb();
  const rows = await PlantDiagnosis.find({ userId: new Types.ObjectId(userId) })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select("plantName health summary createdAt")
    .lean();
  return rows.map((row) => ({
    id: String(row._id),
    createdAt: row.createdAt.toISOString(),
    plantName: row.plantName,
    health: row.health as HealthLevel,
    summary: row.summary,
  }));
}

const OBJECT_ID = /^[a-f\d]{24}$/i;

export async function getCheck(userId: string, id: string): Promise<DiagnosisRecord> {
  if (!OBJECT_ID.test(id)) throw notFound("We couldn't find that check.");
  await connectDb();
  const row = await PlantDiagnosis.findOne({ _id: id, userId: new Types.ObjectId(userId) }).lean();
  if (!row) throw notFound("We couldn't find that check.");
  return {
    id: String(row._id),
    createdAt: row.createdAt.toISOString(),
    diagnosis: await hydrate(row.result as StoredDiagnosis),
  };
}

export async function deleteCheck(userId: string, id: string): Promise<void> {
  if (!OBJECT_ID.test(id)) return;
  await connectDb();
  await PlantDiagnosis.deleteOne({ _id: id, userId: new Types.ObjectId(userId) });
}
