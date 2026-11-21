import { z } from "zod";

/**
 * Call this at the top of every schema module that client code loads, BEFORE any schema is built.
 *
 * zod's JIT fast path probes `new Function("")` when a schema is constructed; our Content-Security-Policy blocks
 * (and reports) that probe before zod falls back, so JIT is switched off in the browser. The server keeps JIT.
 *
 * It must be an explicit call in the schema module itself: a side effect hidden in a re-export module
 * (`export { z } from ...`) gets optimised away by the bundler and the setting silently disappears. The CSP
 * end-to-end test (`e2e/csp.spec.ts`) fails if that ever happens again.
 */
export function configureZodForBrowser(): void {
  if (typeof window !== "undefined") z.config({ jitless: true });
}
