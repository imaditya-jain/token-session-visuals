import http from "k6/http";

export const BASE = (__ENV.BASE_URL || "http://localhost:3100").replace(/\/$/, "");
export const ORIGIN = BASE;

/** A distinct client IP per virtual user: the app's rate limiter keys on it, as it does for real visitors. */
export const ipFor = (vu, iter = 0) => `10.${(vu >> 8) & 255}.${vu & 255}.${(iter % 250) + 1}`;

export const json = (extra = {}) => ({
  "Content-Type": "application/json",
  Origin: ORIGIN,
  ...extra,
});

/** Status codes the scenarios EXPECT, so k6 doesn't count a deliberate 403/404 as a failed request. */
export const expectOk = http.expectedStatuses({ min: 200, max: 299 });
export const expectOkOr403 = http.expectedStatuses({ min: 200, max: 299 }, 403);
