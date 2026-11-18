/**
 * Hermetic server for end-to-end tests: production build + `next start` with an isolated in-memory
 * MongoDB, throwaway auth secrets and Shopify disabled (fallback catalog). Never touches real services.
 *
 *   node scripts/e2e-server.mjs            # build + serve on $PORT (default 3100)
 *   SKIP_BUILD=1 node scripts/e2e-server.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, rmSync, writeFileSync } from "node:fs";

import { MongoMemoryServer } from "mongodb-memory-server";

const port = process.env.PORT ?? "3100";
if (!process.env.MONGOMS_SYSTEM_BINARY && existsSync("/usr/bin/mongod")) {
  process.env.MONGOMS_SYSTEM_BINARY = "/usr/bin/mongod";
}

const mongo = await MongoMemoryServer.create();
const webhookSecret = randomBytes(24).toString("base64url");
const cronSecret = randomBytes(24).toString("base64url");
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
  SHOPIFY_WEBHOOK_SECRET: webhookSecret,
  // Email goes nowhere: SMTP points at a closed local port so delivery fails instantly and the queued job
  // (with its one-time link) stays in the database, where the tests read it.
  SMTP_EMAIL: "shop@fernwood.test",
  SMTP_PASS: "e2e-not-a-real-password",
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: "1",
  CRON_SECRET: cronSecret,
};

// Tell the test process where the database is (never a real cluster).
const runtimeFile = ".e2e-runtime.json";
writeFileSync(
  runtimeFile,
  JSON.stringify({ mongoUri: mongo.getUri(), dbName: "fernwood_e2e", webhookSecret, cronSecret }),
);
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
  rmSync(runtimeFile, { force: true });
  await mongo.stop();
  process.exit(code);
};
server.on("exit", (code) => shutdown(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => shutdown(0));
