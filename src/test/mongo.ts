import { existsSync } from "node:fs";

import { MongoMemoryServer } from "mongodb-memory-server";
import { vi } from "vitest";

import { resetEnvCache } from "@/server/config/env";

/** Starts an isolated in-memory MongoDB and points the auth env at it. Never touches a real cluster. */
export async function startTestDatabase(): Promise<MongoMemoryServer> {
  // Prefer a locally installed mongod (no download); fall back to mongodb-memory-server's own binary.
  if (!process.env["MONGOMS_SYSTEM_BINARY"] && existsSync("/usr/bin/mongod")) {
    process.env["MONGOMS_SYSTEM_BINARY"] = "/usr/bin/mongod";
  }
  const server = await MongoMemoryServer.create();
  vi.stubEnv("MONGODB_URI", server.getUri());
  vi.stubEnv("MONGODB_DB_NAME", "fernwood_test");
  vi.stubEnv("ACCESS_TOKEN_SECRET", "a".repeat(48));
  vi.stubEnv("REFRESH_TOKEN_SECRET", "b".repeat(48));
  vi.stubEnv("ACCESS_TOKEN_EXPIRY", "15m");
  vi.stubEnv("REFRESH_TOKEN_EXPIRY", "7d");
  resetEnvCache();
  return server;
}
