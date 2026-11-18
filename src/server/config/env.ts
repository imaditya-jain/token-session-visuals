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
