import { describe, expect, it } from "vitest";

import { fromLocalInput, toLocalInput } from "./datetime-local";

describe("datetime-local helpers", () => {
  it("round-trips an instant through the local input format", () => {
    const iso = "2030-06-15T09:30:00.000Z";
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
  });

  it("returns empty or null for missing and invalid values", () => {
    expect(toLocalInput(null)).toBe("");
    expect(toLocalInput("nonsense")).toBe("");
    expect(fromLocalInput("")).toBeNull();
    expect(fromLocalInput("nonsense")).toBeNull();
  });

  it("formats with zero padding", () => {
    expect(toLocalInput(new Date(2030, 0, 5, 3, 7).toISOString())).toBe("2030-01-05T03:07");
  });
});
