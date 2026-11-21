import { beforeEach, describe, expect, it, vi } from "vitest";

const admin = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/server/shopify/admin", () => ({ adminQuery: admin.query }));

import { requestCustomerErasure } from "./customer-erasure";

const GID = "gid://shopify/Customer/123";
const reply = (userErrors: { field: string[] | null; message: string; code: string | null }[]) => ({
  customerRequestDataErasure: { customerId: userErrors.length ? null : GID, userErrors },
});

beforeEach(() => admin.query.mockReset());

describe("requestCustomerErasure", () => {
  it("sends the customer id to Shopify", async () => {
    admin.query.mockResolvedValue(reply([]));
    await expect(requestCustomerErasure(GID)).resolves.toBeUndefined();
    expect(admin.query).toHaveBeenCalledTimes(1);
    expect(admin.query.mock.calls[0]?.[1]).toEqual({ customerId: GID });
    expect(String(admin.query.mock.calls[0]?.[0])).toContain("customerRequestDataErasure");
  });

  it("treats a customer that no longer exists as done (by code, as measured against a real store)", async () => {
    admin.query.mockResolvedValue(
      reply([
        { field: ["customerId"], message: "Customer does not exist", code: "DOES_NOT_EXIST" },
      ]),
    );
    await expect(requestCustomerErasure(GID)).resolves.toBeUndefined();
  });

  it("also recognises the same outcome by its wording", async () => {
    admin.query.mockResolvedValue(
      reply([{ field: null, message: "Erasure was already requested", code: null }]),
    );
    await expect(requestCustomerErasure(GID)).resolves.toBeUndefined();
  });

  it("fails loudly, with guidance, on the ambiguous FAILED_TO_REQUEST answer", async () => {
    admin.query.mockResolvedValue(
      reply([
        {
          field: null,
          message: "Failed to request customer data erasure",
          code: "FAILED_TO_REQUEST",
        },
      ]),
    );
    await expect(requestCustomerErasure(GID)).rejects.toThrow(
      /FAILED_TO_REQUEST.*already pending.*Shopify admin/s,
    );
  });

  it("fails on any other error", async () => {
    admin.query.mockResolvedValue(
      reply([{ field: null, message: "Access denied", code: "ACCESS_DENIED" }]),
    );
    await expect(requestCustomerErasure(GID)).rejects.toThrow(/ACCESS_DENIED: Access denied/);
  });

  it("fails when Shopify returns an unexpected shape", async () => {
    admin.query.mockResolvedValue({ unexpected: true });
    await expect(requestCustomerErasure(GID)).rejects.toThrow();
  });
});
