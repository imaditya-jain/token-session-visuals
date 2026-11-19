import { describe, expect, it } from "vitest";

import { contactSchema } from "./contact-schemas";

const valid = {
  name: "Ada Lovelace",
  email: "  ADA@Example.com ",
  topic: "Plant care advice",
  message: "My fern is turning brown, what should I do?",
};

describe("contactSchema", () => {
  it("normalizes a valid message", () => {
    expect(contactSchema.parse(valid)).toMatchObject({ email: "ada@example.com", website: "" });
  });

  it.each([
    ["header injection in name", { name: "Ada\r\nBcc: victim@example.com" }],
    ["empty name", { name: "   " }],
    ["bad email", { email: "not-an-email" }],
    ["unknown topic", { topic: "Free money" }],
    ["short message", { message: "hi" }],
    ["huge message", { message: "x".repeat(3001) }],
    ["non-string message", { message: { $ne: "" } }],
  ])("rejects %s", (_name, patch) => {
    expect(contactSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});
