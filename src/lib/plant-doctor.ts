/** Shapes shared by the Plant Doctor API, the website and the app. Types only: nothing here runs in the browser. */
import type { Product } from "@/lib/types";

export const HEALTH_LEVELS = [
  "healthy",
  "minor_issues",
  "needs_attention",
  "urgent",
  "unclear",
] as const;
export type HealthLevel = (typeof HEALTH_LEVELS)[number];

export const FINDING_KINDS = [
  "disease",
  "pest",
  "watering",
  "light",
  "nutrition",
  "humidity_temperature",
  "physical_damage",
  "normal_variation",
  "other",
] as const;
export type FindingKind = (typeof FINDING_KINDS)[number];

export type Confidence = "low" | "medium" | "high";

export type Finding = {
  title: string;
  kind: FindingKind;
  confidence: Confidence;
  severity: "mild" | "moderate" | "severe";
  /** What in the photo points to this. */
  evidence: string;
  likelyCauses: string[];
};

export type Diagnosis = {
  isPlant: boolean;
  /** When the photo cannot be judged, what would make a better one. */
  photoIssue: string | null;
  plant: { commonName: string; scientificName: string | null; confidence: Confidence } | null;
  health: HealthLevel;
  summary: string;
  findings: Finding[];
  carePlan: { rightNow: string[]; thisWeek: string[]; ongoing: string[]; avoid: string[] };
  watchFor: string[];
  /** Questions whose answers would sharpen the diagnosis. */
  questions: string[];
  whenToGetHelp: string | null;
  /** Products from our own shop that fit the plan, with the reason for each. */
  products: { product: Product; reason: string }[];
};

export type DiagnosisRecord = {
  id: string;
  createdAt: string;
  diagnosis: Diagnosis;
};

export type DiagnosisSummary = {
  id: string;
  createdAt: string;
  plantName: string;
  health: HealthLevel;
  summary: string;
};

export const MAX_NOTES_LENGTH = 500;
/** The photo the browser or app sends has already been shrunk below this (Vercel caps request bodies at 4.5 MB). */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const PLANT_DOCTOR_DISCLAIMER =
  "This is guidance from an AI looking at one photo, not a guarantee. If a plant is valuable to you or getting worse quickly, ask a local nursery or horticulturist as well.";
