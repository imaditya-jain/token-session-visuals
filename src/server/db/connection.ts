import "server-only";

import mongoose from "mongoose";

import { authEnv } from "@/server/config/env";
import { ensureIndexes } from "@/server/db/indexes";

type Cache = { promise?: Promise<typeof mongoose> | undefined };
const globalCache = globalThis as typeof globalThis & { __fernwoodMongo?: Cache };
const cache: Cache = (globalCache.__fernwoodMongo ??= {});

/**
 * Cached connection (survives hot reloads and is reused across warm serverless invocations).
 * The database name is always explicit: an Atlas URI without one would silently use `test`.
 */
export async function connectDb(): Promise<typeof mongoose> {
  if (!cache.promise) {
    const { MONGODB_URI, MONGODB_DB_NAME } = authEnv();
    mongoose.set("strictQuery", true);
    cache.promise = mongoose
      .connect(MONGODB_URI, {
        dbName: MONGODB_DB_NAME,
        bufferCommands: false,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5_000,
        // Indexes are created explicitly below, once per process, in every environment.
        autoIndex: false,
      })
      .then(async (connection) => {
        await ensureIndexes();
        return connection;
      })
      .catch((error: unknown) => {
        cache.promise = undefined;
        throw error;
      });
  }
  return cache.promise;
}

/** Test/shutdown hook. */
export async function disconnectDb(): Promise<void> {
  if (!cache.promise) return;
  const connection = await cache.promise;
  cache.promise = undefined;
  await connection.disconnect();
}
