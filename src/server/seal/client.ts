import "server-only";

import { z } from "zod";

import { sealToken } from "@/server/config/env";
import { AppError } from "@/server/http/errors";
import { logger } from "@/server/logger";

const BASE = "https://app.sealsubscriptions.com/shopify/merchant/api/";
const TIMEOUT_MS = 10_000;

const envelope = z.object({
  success: z.boolean().optional(),
  payload: z.unknown().optional(),
  error: z.unknown().optional(),
});

export const sealConfigured = (): boolean => sealToken() !== null;

/**
 * One call to the Seal Merchant API. The base address is fixed (only the path varies and is always one of ours), the
 * token never leaves the server, and every failure becomes a clean 503 without leaking Seal's text.
 */
export async function sealRequest(
  method: "GET" | "PUT",
  path: string,
  options: { query?: Record<string, string>; body?: unknown } = {},
): Promise<unknown> {
  const token = sealToken();
  if (!token) {
    throw new AppError(
      503,
      "seal_not_configured",
      "Seal Subscriptions isn't connected. Add the Seal API token (SEAL_API_TOKEN) to the server settings.",
    );
  }
  const url = new URL(path, BASE);
  for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);
  try {
    const response = await fetch(url, {
      method,
      headers: { "X-Seal-Token": token, "Content-Type": "application/json" },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) {
      logger.error({ status: response.status, path }, "Seal request failed");
      if (response.status === 401 || response.status === 403) {
        throw new AppError(
          503,
          "seal_rejected",
          "Seal didn't accept the API token. Check SEAL_API_TOKEN.",
        );
      }
      throw new AppError(
        503,
        "seal_unavailable",
        "Seal Subscriptions is unavailable right now. Please try again.",
        {
          "Retry-After": "30",
        },
      );
    }
    const parsed = envelope.parse(await response.json());
    if (parsed.success === false) {
      logger.error({ path }, "Seal refused the request");
      throw new AppError(
        422,
        "seal_rejected_change",
        "Seal couldn't do that for this subscription.",
      );
    }
    return parsed.payload;
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error(
      { err: error instanceof Error ? error.message : String(error), path },
      "Seal call failed",
    );
    throw new AppError(
      503,
      "seal_unavailable",
      "Seal Subscriptions is unavailable right now. Please try again.",
      {
        "Retry-After": "30",
      },
    );
  }
}
