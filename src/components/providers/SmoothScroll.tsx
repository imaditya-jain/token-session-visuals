"use client";

import { useEffect } from "react";

/**
 * Buttery inertial scroll. Disabled for users who prefer reduced motion. The library is loaded when the browser is
 * idle (after first paint) as its own chunk, so it never competes with hydration for the main thread.
 */
export default function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cancelled = false;
    let stop: (() => void) | undefined;

    const start = () => {
      void import("lenis").then(({ default: Lenis }) => {
        if (cancelled) return;
        const lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
        let frame = requestAnimationFrame(function raf(time) {
          lenis.raf(time);
          frame = requestAnimationFrame(raf);
        });
        stop = () => {
          cancelAnimationFrame(frame);
          lenis.destroy();
        };
      });
    };

    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(start, { timeout: 2000 })
      : window.setTimeout(start, 200);

    return () => {
      cancelled = true;
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      stop?.();
    };
  }, []);
  return null;
}
