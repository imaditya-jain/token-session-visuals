import "server-only";

import { z } from "zod";

/**
 * Shopify API version is pinned deliberately; upgrade by changing this constant and running the
 * contract tests.
 */
export const SHOPIFY_API_VERSION = "2025-10";

const hostFromUrl = (value: string) => value.replace(/^https?:\/\//, "").replace(/\/.*$/, "");

const shopifySchema = z.object({
  SHOPIFY_STORE_URL: z
    .string()
    .min(1, "SHOPIFY_STORE_URL is required")
    .transform(hostFromUrl)
    .refine(
      (host) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host),
      "SHOPIFY_STORE_URL must be a store host",
    ),
  SHOPIFY_STOREFRONT_API_ACCESS_TOKEN: z
    .string()
    .min(10, "SHOPIFY_STOREFRONT_API_ACCESS_TOKEN is required"),
});

export type ShopifyEnv = z.infer<typeof shopifySchema>;

let cached: ShopifyEnv | undefined;

/** Validated lazily so importing this module never throws; first use fails fast with a clear message. */
export function shopifyEnv(): ShopifyEnv {
  if (cached) return cached;
  const parsed = shopifySchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid Shopify environment: ${problems}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test hook: reset the memoized env. */
export function resetEnvCache() {
  cached = undefined;
  cachedAuth = undefined;
  cachedEmail = undefined;
  cachedAdmin = undefined;
}

const UNIT_SECONDS = { s: 1, m: 60, h: 3600, d: 86_400 } as const;

/** "15m" | "7d" … → seconds. */
const duration = z
  .string()
  .regex(/^\d+[smhd]$/, 'must look like "15m" or "7d"')
  .transform(
    (value) =>
      Number(value.slice(0, -1)) * UNIT_SECONDS[value.slice(-1) as keyof typeof UNIT_SECONDS],
  );

const authSchema = z
  .object({
    ACCESS_TOKEN_SECRET: z.string().min(32, "ACCESS_TOKEN_SECRET must be at least 32 characters"),
    REFRESH_TOKEN_SECRET: z.string().min(32, "REFRESH_TOKEN_SECRET must be at least 32 characters"),
    ACCESS_TOKEN_EXPIRY: duration.default(900).pipe(z.number().min(60).max(3600)),
    REFRESH_TOKEN_EXPIRY: duration.default(604_800).pipe(z.number().min(3600).max(2_592_000)),
    MONGODB_URI: z
      .string()
      .regex(/^mongodb(\+srv)?:\/\//, "MONGODB_URI must be a MongoDB connection string"),
    MONGODB_DB_NAME: z.string().min(1).default("fernwood"),
    SITE_URL: z.string().url().optional(),
  })
  .refine((env) => env.ACCESS_TOKEN_SECRET !== env.REFRESH_TOKEN_SECRET, {
    message: "ACCESS_TOKEN_SECRET and REFRESH_TOKEN_SECRET must differ",
    path: ["REFRESH_TOKEN_SECRET"],
  });

export type AuthEnv = z.infer<typeof authSchema>;

let cachedAuth: AuthEnv | undefined;

/** Defaults (15 minute access token, 7 day refresh token) apply when the expiry variables are unset. */
export function authEnv(): AuthEnv {
  if (cachedAuth) return cachedAuth;
  const parsed = authSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid auth environment: ${problems}`);
  }
  cachedAuth = parsed.data;
  return cachedAuth;
}

const emailSchema = z.object({
  SMTP_EMAIL: z.string().email("SMTP_EMAIL must be an email address"),
  SMTP_PASS: z.string().min(8, "SMTP_PASS is required"),
  SMTP_HOST: z.string().min(1).default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(465),
  SMTP_FROM_NAME: z.string().min(1).default("Fernwood"),
  /** Where contact-form messages are delivered. Defaults to the sending mailbox. */
  /**
   * Send our own branded order emails (received / shipped / cancelled). Off by default because Shopify sends its own
   * order emails: enable only after turning those off in Shopify, or customers receive every message twice.
   */
  ORDER_EMAIL_NOTIFICATIONS: z.preprocess((v) => v === "true", z.boolean()),
  CONTACT_INBOX: z.preprocess((v) => (v === "" ? undefined : v), z.string().email().optional()),
});

export type EmailEnv = z.infer<typeof emailSchema>;

let cachedEmail: EmailEnv | undefined;

export function emailEnv(): EmailEnv {
  if (cachedEmail) return cachedEmail;
  const parsed = emailSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid email environment: ${problems}`);
  }
  cachedEmail = parsed.data;
  return cachedEmail;
}

/**
 * Public origin used in links inside emails. It comes from configuration, never from the request's
 * Host header (which an attacker controls and could use to poison password-reset links).
 */
export function siteUrl(): string {
  const configured = process.env["SITE_URL"];
  if (configured) return new URL(configured).origin;
  if (process.env["NODE_ENV"] === "production")
    throw new Error("SITE_URL must be set in production");
  return "http://localhost:3000";
}

const adminSchema = z.object({
  SHOPIFY_STORE_URL: shopifySchema.shape.SHOPIFY_STORE_URL,
  SHOPIFY_ADMIN_API_ACCESS_TOKEN: z.string().min(10, "SHOPIFY_ADMIN_API_ACCESS_TOKEN is required"),
});

export type AdminEnv = z.infer<typeof adminSchema>;

let cachedAdmin: AdminEnv | undefined;

/** Server-only Admin credentials (orders, customers). Never imported by client code. */
export function adminEnv(): AdminEnv {
  if (cachedAdmin) return cachedAdmin;
  const parsed = adminSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid Shopify Admin environment: ${problems}`);
  }
  cachedAdmin = parsed.data;
  return cachedAdmin;
}

/** Seal Subscriptions Merchant API token (Seal app > Settings > General Settings > API). Optional. */
export function sealToken(): string | null {
  const token = process.env["SEAL_API_TOKEN"]?.trim();
  return token && token.length >= 10 ? token : null;
}
