"use client";

import { useCallback, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api-client";

/**
 * Runs an admin mutation: tracks pending state and surfaces the server's own message (it never contains
 * internals) so a refusal such as "You can't grant permissions you don't have." reaches the person.
 */
export function useAdminMutation() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async <T>(path: string, method: string, json?: unknown): Promise<T | null> => {
      setPending(true);
      setError(null);
      try {
        return await apiFetch<T>(path, { method, ...(json !== undefined ? { json } : {}) });
      } catch (caught) {
        setError(
          caught instanceof ApiError
            ? caught.message
            : "Network problem. Check your connection and try again.",
        );
        return null;
      } finally {
        setPending(false);
      }
    },
    [],
  );

  return { run, pending, error, clearError: () => setError(null) };
}
