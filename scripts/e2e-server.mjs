/**
 * Hermetic server for end-to-end tests: production build + `next start` with an isolated in-memory
 * MongoDB, throwaway auth secrets and Shopify disabled (fallback catalog). Never touches real services.
 *
 *   node scripts/e2e-server.mjs            # build + serve on $PORT (default 3100)
 *   SKIP_BUILD=1 node scripts/e2e-server.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";

import { MongoMemoryServer } from "mongodb-memory-server";

const port = process.env.PORT ?? "3100";
if (!process.env.MONGOMS_SYSTEM_BINARY && existsSync("/usr/bin/mongod")) {
  process.env.MONGOMS_SYSTEM_BINARY = "/usr/bin/mongod";
}

const mongo = await MongoMemoryServer.create();
const env = {
  ...process.env,
  MONGODB_URI: mongo.getUri(),
  MONGODB_DB_NAME: "fernwood_e2e",
  ACCESS_TOKEN_SECRET: randomBytes(48).toString("base64url"),
  REFRESH_TOKEN_SECRET: randomBytes(48).toString("base64url"),
  ACCESS_TOKEN_EXPIRY: "15m",
  REFRESH_TOKEN_EXPIRY: "7d",
  SITE_URL: `http://localhost:${port}`,
  // Empty values win over .env: the storefront serves its built-in fallback catalog.
  SHOPIFY_STORE_URL: "",
  SHOPIFY_STOREFRONT_API_ACCESS_TOKEN: "",
  SHOPIFY_ADMIN_API_ACCESS_TOKEN: "",
  SHOPIFY_WEBHOOK_SECRET: "",
};
const next = ["node_modules/next/dist/bin/next"];

if (!process.env.SKIP_BUILD) {
  const build = spawnSync(process.execPath, [...next, "build"], { env, stdio: "inherit" });
  if (build.status !== 0) {
    await mongo.stop();
    process.exit(build.status ?? 1);
  }
}

const server = spawn(process.execPath, [...next, "start", "-p", port], { env, stdio: "inherit" });

let stopping = false;
const shutdown = async (code = 0) => {
  if (stopping) return;
  stopping = true;
  server.kill("SIGTERM");
  await mongo.stop();
  process.exit(code);
};
server.on("exit", (code) => shutdown(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => shutdown(0));
