import { beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/nextjs", () => sentry);

import { reportError } from "./monitoring";

beforeEach(() => sentry.captureException.mockReset());

describe("reportError", () => {
  it("forwards the error with searchable tags only", () => {
    const error = new Error("boom");
    reportError(error, { requestId: "r1", route: "/api/orders" });
    expect(sentry.captureException).toHaveBeenCalledWith(error, {
      tags: { requestId: "r1", route: "/api/orders" },
    });
  });

  it("works without context", () => {
    reportError("a string failure");
    expect(sentry.captureException).toHaveBeenCalledWith("a string failure", { tags: {} });
  });
});
