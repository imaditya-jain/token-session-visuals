"use client";

import { useEffect, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api-client";

type Settled<T> =
  | { status: "ready"; data: T }
  | { status: "error"; code: string; message: string; httpStatus: number };

export type ResourceState<T> = { status: "loading" } | Settled<T>;

/**
 * Loads an authenticated API resource whenever `path` changes (or after `retry`). Each result is tied to the
 * request that produced it, so a stale response can never be shown and "loading" is derived, not set.
 */
export function useApiResource<T>(path: string | null): ResourceState<T> & { retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; settled: Settled<T> } | null>(null);
  const key = `${path}#${attempt}`;

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    apiFetch<T>(path)
      .then((data) => {
        if (!cancelled) setResult({ key, settled: { status: "ready", data } });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const api = error instanceof ApiError ? error : null;
        setResult({
          key,
          settled: {
            status: "error",
            code: api?.code ?? "network_error",
            message: api?.message ?? "Network problem. Check your connection and try again.",
            httpStatus: api?.status ?? 0,
          },
        });
      });
    return () => {
      cancelled = true;
    };
  }, [path, key]);

  const state: ResourceState<T> = result?.key === key ? result.settled : { status: "loading" };
  return { ...state, retry: () => setAttempt((value) => value + 1) };
}
