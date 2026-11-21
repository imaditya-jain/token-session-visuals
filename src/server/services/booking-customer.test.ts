// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const sync = vi.hoisted(() => ({ findByEmail: vi.fn(), createCustomer: vi.fn() }));
const news = vi.hoisted(() => ({ subscribe: vi.fn() }));
const producers = vi.hoisted(() => ({ adminConfigured: vi.fn() }));
vi.mock("@/server/services/customer-sync", () => ({
  ...sync,
  toE164: (phone: string) => phone.replace(/[\s()-]/g, ""),
}));
vi.mock("@/server/services/newsletter", () => news);
vi.mock("@/server/queue/producers", () => producers);
vi.mock("@/server/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/server/monitoring", () => ({ reportError: vi.fn() }));

import { ensureBookingCustomer } from "./booking-customer";

const booking = {
  name: "Ada Byron Lovelace",
  email: "ada@example.com",
  acceptsMarketing: false,
  city: "Pune" as const,
  address: "12 Garden Road, Baner",
  date: "2999-01-01",
  phone: "+91 98765 43210",
};

beforeEach(() => {
  vi.resetAllMocks();
  producers.adminConfigured.mockReturnValue(true);
});

describe("ensureBookingCustomer", () => {
  it("creates a customer with name, phone and address when none exists", async () => {
    sync.findByEmail.mockResolvedValue(null);
    await ensureBookingCustomer(booking);
    expect(sync.createCustomer).toHaveBeenCalledWith(
      "ada@example.com",
      { firstName: "Ada", lastName: "Byron Lovelace", phone: "+919876543210" },
      {
        tags: ["fernwood-web", "gardener-booking"],
        addresses: [
          {
            firstName: "Ada",
            lastName: "Byron Lovelace",
            address1: "12 Garden Road, Baner",
            city: "Pune",
            countryCode: "IN",
            phone: "+919876543210",
          },
        ],
      },
    );
    expect(news.subscribe).not.toHaveBeenCalled();
  });

  it("never modifies a customer that already exists", async () => {
    sync.findByEmail.mockResolvedValue("gid://shopify/Customer/1");
    await ensureBookingCustomer(booking);
    expect(sync.createCustomer).not.toHaveBeenCalled();
  });

  it("starts the double opt-in only when the box was ticked", async () => {
    sync.findByEmail.mockResolvedValue("gid://shopify/Customer/1");
    await ensureBookingCustomer({ ...booking, acceptsMarketing: true });
    expect(news.subscribe).toHaveBeenCalledWith("ada@example.com", "booking");
  });

  it("does not touch Shopify when Admin is not configured, but still honours the opt-in", async () => {
    producers.adminConfigured.mockReturnValue(false);
    await ensureBookingCustomer({ ...booking, acceptsMarketing: true });
    expect(sync.findByEmail).not.toHaveBeenCalled();
    expect(news.subscribe).toHaveBeenCalled();
  });

  it("never throws: a Shopify failure must not block the booking", async () => {
    sync.findByEmail.mockRejectedValue(new Error("down"));
    await expect(ensureBookingCustomer(booking)).resolves.toBeUndefined();
  });
});
