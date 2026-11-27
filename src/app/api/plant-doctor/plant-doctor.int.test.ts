// @vitest-environment node
import type { MongoMemoryServer } from "mongodb-memory-server";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { resetEnvCache } from "@/server/config/env";
import { disconnectDb } from "@/server/db/connection";
import { PlantDiagnosis } from "@/server/db/models/plant-diagnosis";
import { RateLimit } from "@/server/db/models/rate-limit";
import { User } from "@/server/db/models/user";
import { registerUser } from "@/server/services/auth";
import { startTestDatabase } from "@/test/mongo";

import { DELETE, GET as getOne } from "./[id]/route";
import { GET as list, POST as analyse } from "./route";

const sdk = vi.hoisted(() => ({ parse: vi.fn(), create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = { messages: { parse: sdk.parse, create: sdk.create } };
  },
}));

const product = (slug: string, inStock = true) => ({
  id: slug,
  slug,
  name: slug,
  category: slug.includes("pot") ? "Pots & Planters" : "House Plants",
  price: 20,
  image: "/x.jpg",
  light: "Bright",
  size: "S",
  inStock,
  collectionSlugs: [],
});
vi.mock("@/data/catalog", () => ({
  getProducts: vi.fn(async () => [
    product("terracotta-pot"),
    product("pruners"),
    product("sold-out-pot", false),
  ]),
  getProduct: vi.fn(),
}));

const ORIGIN = "http://localhost:3100";
let server: MongoMemoryServer;

const answer = (over: Record<string, unknown> = {}) => ({
  isPlant: true,
  photoIssue: null,
  plant: { commonName: "Monstera", scientificName: "Monstera deliciosa", confidence: "high" },
  health: "needs_attention",
  summary: "Leaves are yellowing, most likely from too much water.",
  findings: [
    {
      title: "Overwatering",
      kind: "watering",
      confidence: "medium",
      severity: "moderate",
      evidence: "Yellow lower leaves",
      likelyCauses: ["Soil stays wet"],
    },
  ],
  carePlan: {
    rightNow: ["Stop watering"],
    thisWeek: ["Check drainage"],
    ongoing: ["Water when the top inch is dry"],
    avoid: ["Standing water"],
  },
  watchFor: ["New yellow leaves"],
  prevention: ["Let the top inch of soil dry between waterings."],
  questions: ["How often do you water?"],
  whenToGetHelp: null,
  productPicks: [
    { handle: "terracotta-pot", reason: "Drains better." },
    { handle: "made-up-fungicide", reason: "Invented." },
    { handle: "sold-out-pot", reason: "Sold out." },
    { handle: "terracotta-pot", reason: "Duplicate." },
    { handle: "pruners", reason: "Cut damaged leaves." },
  ],
  ...over,
});
const modelResult = (output: unknown, over: Record<string, unknown> = {}) => ({
  stop_reason: "end_turn",
  model: "claude-opus-5-5",
  parsed_output: output,
  usage: { input_tokens: 1500, output_tokens: 900 },
  ...over,
});

beforeAll(async () => {
  server = await startTestDatabase();
}, 120_000);
afterAll(async () => {
  await disconnectDb();
  await server.stop();
  vi.unstubAllEnvs();
  resetEnvCache();
});
beforeEach(async () => {
  const { connectDb } = await import("@/server/db/connection");
  await connectDb();
  await Promise.all([User.deleteMany({}), PlantDiagnosis.deleteMany({}), RateLimit.deleteMany({})]);
  sdk.parse.mockReset();
  sdk.create.mockReset();
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-key-0000000000000000");
  vi.stubEnv("PLANT_DOCTOR_PER_USER_DAILY", "");
  vi.stubEnv("PLANT_DOCTOR_DAILY_CAP", "");
  resetEnvCache();
});
afterEach(() => vi.restoreAllMocks());

const meta = { ip: "198.51.100.88", userAgent: "vitest" };
async function signUp(email: string) {
  const { accessToken, user } = await registerUser(
    {
      email,
      password: "correct horse battery",
      firstName: "P",
      lastName: "D",
      acceptsMarketing: false,
    },
    meta,
  );
  return { token: accessToken, id: user.id };
}

const jpeg = (width = 600, height = 600) =>
  sharp({ create: { width, height, channels: 3, background: { r: 40, g: 120, b: 50 } } })
    .jpeg()
    .toBuffer();

function upload(
  token: string | null,
  file: Buffer | null,
  opts: { notes?: string; type?: string; origin?: string | null; ip?: string } = {},
) {
  const form = new FormData();
  if (file)
    form.set(
      "photo",
      new File([new Uint8Array(file)], "plant.jpg", { type: opts.type ?? "image/jpeg" }),
    );
  if (opts.notes !== undefined) form.set("notes", opts.notes);
  const origin = opts.origin === undefined ? ORIGIN : opts.origin;
  return new NextRequest(`${ORIGIN}/api/plant-doctor`, {
    method: "POST",
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(origin ? { origin } : {}),
      "x-forwarded-for": opts.ip ?? "198.51.100.90",
    },
    body: form,
  });
}
const get = (path: string, token: string, method = "GET") =>
  new NextRequest(`${ORIGIN}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, origin: ORIGIN },
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (r: Response): Promise<any> => r.json();

describe("Plant Doctor", () => {
  it("needs a signed-in customer and a same-origin request", async () => {
    const { token } = await signUp("pd1@example.com");
    expect((await analyse(upload(null, await jpeg()))).status).toBe(401);
    expect(
      (await analyse(upload(token, await jpeg(), { origin: "https://evil.example" }))).status,
    ).toBe(403);
    expect(sdk.parse).not.toHaveBeenCalled();
  });

  it("says it is not set up when there is no API key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    resetEnvCache();
    const { token } = await signUp("pd2@example.com");
    const response = await analyse(upload(token, await jpeg()));
    expect(response.status).toBe(503);
    expect((await json(response)).error.code).toBe("plant_doctor_not_configured");
    expect((await json(await list(get("/api/plant-doctor", token)))).data.enabled).toBe(false);
  });

  it("rejects bad uploads before any AI call or use of the daily allowance", async () => {
    const { token } = await signUp("pd3@example.com");
    expect((await analyse(upload(token, null))).status).toBe(400);
    expect(
      (await analyse(upload(token, Buffer.from("not an image at all, just text bytes")))).status,
    ).toBe(415);
    expect((await analyse(upload(token, await jpeg(), { type: "application/pdf" }))).status).toBe(
      415,
    );
    expect((await analyse(upload(token, await jpeg(50, 50)))).status).toBe(422);
    expect((await analyse(upload(token, await jpeg(), { notes: "x".repeat(2000) }))).status).toBe(
      400,
    );
    expect(sdk.parse).not.toHaveBeenCalled();
  });

  it("returns a grounded diagnosis, remembers it, and never shows products we do not sell", async () => {
    sdk.parse.mockResolvedValue(modelResult(answer()));
    const { token } = await signUp("pd4@example.com");
    const response = await analyse(
      upload(token, await jpeg(), { notes: "Water every day.\u0007" }),
    );
    expect(response.status).toBe(201);
    const { data } = await json(response);
    expect(data.diagnosis.health).toBe("needs_attention");
    expect(
      data.diagnosis.products.map((p: { product: { slug: string } }) => p.product.slug),
    ).toEqual(["terracotta-pot", "pruners"]);

    const call = sdk.parse.mock.calls[0]?.[0];
    expect(call.model).toBe("claude-opus-5-5");
    expect(JSON.stringify(call.system)).toContain("terracotta-pot");
    expect(JSON.stringify(call.messages)).toContain("Water every day.");
    expect(JSON.stringify(call.messages)).not.toContain("\u0007");
    expect(call.messages[0].content[0].source.media_type).toBe("image/jpeg");

    const listed = await json(await list(get("/api/plant-doctor", token)));
    expect(listed.data.enabled).toBe(true);
    expect(listed.data.items).toHaveLength(1);
    expect(listed.data.items[0]).toMatchObject({
      plantName: "Monstera",
      health: "needs_attention",
    });

    const one = await json(await getOne(get(`/api/plant-doctor/${data.id}`, token)));
    expect(one.data.diagnosis.products).toHaveLength(2);
    const stored = await PlantDiagnosis.findOne({}).lean();
    expect(stored?.inputTokens).toBe(1500);
  });

  it("adds web research for a suspected disease: tips, treatments, https sources, and only real shop products", async () => {
    const finding = {
      title: "Leaf spot",
      kind: "disease",
      confidence: "medium",
      severity: "moderate",
      evidence: "Brown spots with yellow rims.",
      likelyCauses: ["Fungus"],
    };
    sdk.parse.mockResolvedValue(modelResult(answer({ findings: [finding], productPicks: [] })));
    sdk.create.mockResolvedValue({
      stop_reason: "end_turn",
      content: [
        {
          type: "web_search_tool_result",
          content: [
            { url: "https://extension.example.edu/leaf-spot", title: "Leaf spot guide" },
            { url: "http://insecure.example/x", title: "Insecure" },
          ],
        },
        {
          type: "text",
          text: 'Here you go {"tips":["Remove spotted leaves."],"treatments":[{"name":"Copper fungicide","about":"Slows fungal spread.","safety":"Follow the label."}],"productPicks":[{"handle":"pruners","reason":"Clean cuts."},{"handle":"invented","reason":"x"}]}',
        },
      ],
    });
    const { token } = await signUp("pd-research@example.com");
    const { data } = await json(await analyse(upload(token, await jpeg())));
    expect(data.diagnosis.research.tips).toEqual(["Remove spotted leaves."]);
    expect(data.diagnosis.research.treatments[0].name).toBe("Copper fungicide");
    expect(data.diagnosis.research.sources).toEqual([
      { title: "Leaf spot guide", url: "https://extension.example.edu/leaf-spot" },
    ]);
    expect(
      data.diagnosis.products.map((p: { product: { slug: string } }) => p.product.slug),
    ).toEqual(["pruners"]);
    const call = sdk.create.mock.calls[0]?.[0];
    expect(call.tools[0].type).toBe("web_search_20250305");
    expect(JSON.stringify(call.messages)).not.toContain("data:image");
  });

  it("still returns the photo diagnosis when the web research fails", async () => {
    sdk.parse.mockResolvedValue(
      modelResult(
        answer({
          findings: [
            {
              title: "Spider mites",
              kind: "pest",
              confidence: "high",
              severity: "moderate",
              evidence: "Fine webbing.",
              likelyCauses: ["Dry air"],
            },
          ],
        }),
      ),
    );
    sdk.create.mockRejectedValue(new Error("search down"));
    const { token } = await signUp("pd-research2@example.com");
    const response = await analyse(upload(token, await jpeg()));
    expect(response.status).toBe(201);
    const { data } = await json(response);
    expect(data.diagnosis.research ?? null).toBeNull();
    expect(data.diagnosis.findings[0].title).toBe("Spider mites");
  });

  it("handles a photo that is not a plant or cannot be judged", async () => {
    sdk.parse.mockResolvedValue(
      modelResult(
        answer({
          isPlant: false,
          plant: null,
          health: "healthy",
          findings: [
            {
              title: "x",
              kind: "other",
              confidence: "low",
              severity: "mild",
              evidence: "e",
              likelyCauses: [],
            },
          ],
          photoIssue: "I can't see a plant.",
        }),
      ),
    );
    const { token } = await signUp("pd5@example.com");
    const { data } = await json(await analyse(upload(token, await jpeg())));
    expect(data.diagnosis.isPlant).toBe(false);
    expect(data.diagnosis.health).toBe("unclear");
    expect(data.diagnosis.findings).toEqual([]);
    expect(data.diagnosis.products).toEqual([]);
  });

  it("turns a refusal, a bad answer and an outage into clean errors", async () => {
    const { token } = await signUp("pd6@example.com");
    sdk.parse.mockResolvedValueOnce(modelResult(null, { stop_reason: "refusal" }));
    const refused = await analyse(upload(token, await jpeg(), { ip: "198.51.100.91" }));
    expect(refused.status).toBe(422);
    sdk.parse.mockResolvedValueOnce(modelResult(null));
    expect((await analyse(upload(token, await jpeg(), { ip: "198.51.100.92" }))).status).toBe(502);
    sdk.parse.mockRejectedValueOnce(new Error("upstream exploded: sk-ant-secret"));
    const down = await analyse(upload(token, await jpeg(), { ip: "198.51.100.93" }));
    expect(down.status).toBe(503);
    expect(JSON.stringify(await json(down))).not.toContain("sk-ant");
    expect(await PlantDiagnosis.countDocuments({})).toBe(0);
  });

  it("limits a person per minute and per day, and the whole site per day", async () => {
    sdk.parse.mockResolvedValue(modelResult(answer()));
    vi.stubEnv("PLANT_DOCTOR_PER_USER_DAILY", "2");
    resetEnvCache();
    const { token } = await signUp("pd7@example.com");
    expect((await analyse(upload(token, await jpeg(), { ip: "198.51.100.101" }))).status).toBe(201);
    expect((await analyse(upload(token, await jpeg(), { ip: "198.51.100.102" }))).status).toBe(201);
    const third = await analyse(upload(token, await jpeg(), { ip: "198.51.100.103" }));
    expect(third.status).toBe(429);
    expect(third.headers.get("retry-after")).toBeTruthy();

    vi.stubEnv("PLANT_DOCTOR_PER_USER_DAILY", "10");
    vi.stubEnv("PLANT_DOCTOR_DAILY_CAP", "1");
    resetEnvCache();
    await RateLimit.deleteMany({});
    const other = await signUp("pd8@example.com");
    expect(
      (await analyse(upload(other.token, await jpeg(), { ip: "198.51.100.104" }))).status,
    ).toBe(201);
    const capped = await analyse(upload(other.token, await jpeg(), { ip: "198.51.100.105" }));
    expect(capped.status).toBe(503);
    expect((await json(capped)).error.code).toBe("plant_doctor_busy");
  });

  it("keeps every customer's checks private and lets them delete their own", async () => {
    sdk.parse.mockResolvedValue(modelResult(answer()));
    const ada = await signUp("ada-pd@example.com");
    const bob = await signUp("bob-pd@example.com");
    const { data } = await json(await analyse(upload(ada.token, await jpeg())));
    expect((await getOne(get(`/api/plant-doctor/${data.id}`, bob.token))).status).toBe(404);
    expect((await json(await list(get("/api/plant-doctor", bob.token)))).data.items).toEqual([]);
    await DELETE(get(`/api/plant-doctor/${data.id}`, bob.token, "DELETE"));
    expect(await PlantDiagnosis.countDocuments({})).toBe(1);
    expect((await DELETE(get(`/api/plant-doctor/${data.id}`, ada.token, "DELETE"))).status).toBe(
      204,
    );
    expect(await PlantDiagnosis.countDocuments({})).toBe(0);
    expect((await getOne(get("/api/plant-doctor/not-an-id", ada.token))).status).toBe(404);
  });
});
