import "server-only";

import { z } from "zod";

import { supabaseEnv } from "@/server/config/env";
import { AppError } from "@/server/http/errors";
import { logger } from "@/server/logger";

const TIMEOUT_MS = 10_000;

const unavailable = () =>
  new AppError(
    503,
    "reels_unavailable",
    "Reels are temporarily unavailable. Please try again soon.",
  );

function config() {
  const env = supabaseEnv();
  if (!env) {
    throw new AppError(503, "reels_not_configured", "Reels are not switched on yet.");
  }
  return {
    base: `${env.SUPABASE_URL}/storage/v1`,
    bucket: env.SUPABASE_REELS_BUCKET,
    key: env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

export const reelsConfigured = (): boolean => supabaseEnv() !== null;

/** Each path segment is encoded so a hostile name can never climb out of the bucket. */
const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

async function call(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    logger.error({ err: error }, "Supabase storage request failed");
    throw unavailable();
  }
}

const signedResponse = z.object({ url: z.string().optional(), token: z.string().optional() });

export type SignedUpload = { uploadUrl: string; headers: Record<string, string> };

/**
 * One-time upload address for exactly one object path. The browser or phone sends the file straight to
 * Supabase, so it never passes through our (4.5 MB limited) functions, and it never sees the service key.
 */
export async function createSignedUpload(path: string, contentType: string): Promise<SignedUpload> {
  const { base, bucket, key } = config();
  const response = await call(`${base}/object/upload/sign/${bucket}/${encodePath(path)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!response.ok) {
    logger.error({ status: response.status }, "Supabase refused to sign an upload");
    throw unavailable();
  }
  const parsed = signedResponse.safeParse(await response.json().catch(() => null));
  const token =
    parsed.success &&
    (parsed.data.token ?? new URL(parsed.data.url ?? "", "https://x").searchParams.get("token"));
  if (!token) {
    logger.error("Supabase returned no upload token");
    throw unavailable();
  }
  return {
    uploadUrl: `${base}/object/upload/sign/${bucket}/${encodePath(path)}?token=${encodeURIComponent(token)}`,
    headers: { "Content-Type": contentType },
  };
}

/** Public address of an object. Paths are random, so a pending reel's address is known only to its author. */
export function publicUrl(path: string): string {
  const { base, bucket } = config();
  return `${base}/object/public/${bucket}/${encodePath(path)}`;
}

export type ObjectProbe = { size: number; head: Uint8Array };

/** Size and first bytes of a stored object in one request, or null when it doesn't exist. */
export async function probeObject(path: string): Promise<ObjectProbe | null> {
  const response = await call(publicUrl(path), { headers: { Range: "bytes=0-63" } });
  if (response.status === 404 || response.status === 400) return null;
  if (!response.ok) throw unavailable();
  const range = /\/(\d+)$/.exec(response.headers.get("content-range") ?? "");
  const declared = Number(response.headers.get("content-length") ?? 0);
  const size = range ? Number(range[1]) : declared;
  const reader = response.body?.getReader();
  if (!reader) return { size, head: new Uint8Array() };
  const first = await reader.read();
  await reader.cancel().catch(() => undefined);
  return { size, head: (first.value ?? new Uint8Array()).slice(0, 64) };
}

/** Best effort: a leftover file is logged, never a reason to fail the request that asked for the removal. */
export async function removeObjects(paths: string[]): Promise<void> {
  if (paths.length === 0 || !reelsConfigured()) return;
  const { base, bucket, key } = config();
  try {
    const response = await call(`${base}/object/${bucket}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: paths }),
    });
    if (!response.ok)
      logger.error({ status: response.status, count: paths.length }, "Could not remove reel files");
  } catch (error) {
    logger.error({ err: error, count: paths.length }, "Could not remove reel files");
  }
}
