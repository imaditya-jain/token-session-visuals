"use client";

import { useSyncExternalStore } from "react";

const subscribe = (notify: () => void): (() => void) => {
  window.addEventListener("popstate", notify);
  return () => window.removeEventListener("popstate", notify);
};

/**
 * Reads an OPTIONAL query parameter (`?next=`, `?topic=`) without opting the page out of server rendering.
 *
 * `useSearchParams()` makes a statically rendered page bail out to client-only rendering up to the nearest
 * `<Suspense>`, so a form that merely wants an optional hint ships to the browser as an empty box and pops in after
 * JavaScript runs (no content without JS, late first paint, layout shift). Here the server and the hydration pass
 * both see `null` (the safe default), and the real value is applied right after hydration.
 *
 * Use `useSearchParams()` only where the parameter is essential to what the page shows (one-time tokens).
 */
export function useQueryParam(name: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => new URLSearchParams(window.location.search).get(name),
    () => null,
  );
}
