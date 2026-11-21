import "server-only";

import type { Booking } from "@/lib/gardener-schemas";
import { logger } from "@/server/logger";
import { reportError } from "@/server/monitoring";
import { adminConfigured } from "@/server/queue/producers";
import { createCustomer, findByEmail, toE164 } from "@/server/services/customer-sync";
import { subscribe } from "@/server/services/newsletter";

/** Splits "Ada Byron Lovelace" into the first word and the rest; a single name has no last name. */
const splitName = (name: string): { firstName: string; lastName: string } => {
  const [firstName = "", ...rest] = name.trim().split(/\s+/);
  return { firstName, lastName: rest.join(" ") };
};

/**
 * Makes sure the person who books a gardener visit exists as a Shopify customer, with their name, phone,
 * address and email, so the order (and later visits) belong to a real customer record.
 *
 * - No customer with that email yet: one is created with everything the form collected.
 * - A customer already exists: it is NOT modified. The form never proves the visitor owns that mailbox, so
 *   letting it rewrite a record would let anyone change someone else's details.
 * - Marketing: only if the box was ticked, and then through the normal double opt-in email. Shopify's consent
 *   is written when the mailbox confirms (see `syncMarketingConsentToShopify`), never straight from the form.
 *
 * Best-effort by design: a Shopify outage must not stop someone from booking, so failures are logged and
 * reported, and checkout still creates the customer itself from the order if this missed.
 */
export async function ensureBookingCustomer(booking: Booking): Promise<void> {
  try {
    if (adminConfigured() && !(await findByEmail(booking.email))) {
      const { firstName, lastName } = splitName(booking.name);
      const phone = toE164(booking.phone);
      await createCustomer(
        booking.email,
        { firstName, lastName, phone },
        {
          tags: ["fernwood-web", "gardener-booking"],
          addresses: [
            {
              firstName,
              lastName,
              address1: booking.address,
              city: booking.city,
              // The service area is India only for now (see GARDENER_CITIES).
              countryCode: "IN",
              ...(phone ? { phone } : {}),
            },
          ],
        },
      );
    }
    if (booking.acceptsMarketing) await subscribe(booking.email, "booking");
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error : String(error) },
      "Could not create the customer for a gardener booking",
    );
    reportError(error, { task: "booking-customer" });
  }
}
