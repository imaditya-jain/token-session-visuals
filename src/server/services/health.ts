import "server-only";

import { connectDb } from "@/server/db/connection";
import { adminEnv, emailEnv, shopifyEnv } from "@/server/config/env";
import mongoose from "mongoose";

const DB_TIMEOUT_MS = 3_000;

const configured = (read: () => unknown): "configured" | "not_configured" => {
  try {
    read();
    return "configured";
  } catch {
    return "not_configured";
  }
};

export type Readiness = {
  status: "ok" | "degraded";
  checks: {
    database: "ok" | "down";
    shopify_storefront: "configured" | "not_configured";
    shopify_admin: "configured" | "not_configured";
    email: "configured" | "not_configured";
  };
};

/**
 * Readiness: can this instance do real work? The database is a hard requirement (accounts, sessions, rate limits,
 * jobs), so its failure is "degraded" and the endpoint answers 503. Integrations are reported as configured or
 * not only: probing Shopify on every check would burn API quota and make our health depend on theirs.
 */
export async function checkReadiness(): Promise<Readiness> {
  let database: "ok" | "down" = "down";
  try {
    await Promise.race([
      (async () => {
        await connectDb();
        await mongoose.connection.db?.admin().ping();
      })(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("database ping timed out")), DB_TIMEOUT_MS),
      ),
    ]);
    database = "ok";
  } catch {
    database = "down";
  }
  return {
    status: database === "ok" ? "ok" : "degraded",
    checks: {
      database,
      shopify_storefront: configured(shopifyEnv),
      shopify_admin: configured(adminEnv),
      email: configured(emailEnv),
    },
  };
}
