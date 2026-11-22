import "server-only";

import type { z } from "zod";

import type { wholesaleSchema } from "@/lib/wholesale-schemas";
import { recordEnquiry } from "@/server/services/enquiries";

type WholesaleInput = z.output<typeof wholesaleSchema>;

/**
 * Saves a trade application (shown in the admin, where the team reviews it and, if approved, sets the business up
 * as a Shopify B2B company), then queues the team notification and a one-per-day thank-you to the applicant.
 */
export async function submitWholesaleApplication(input: WholesaleInput): Promise<void> {
  // Bots fill the hidden field; pretend success so they get no signal to adapt to.
  if (input.website.trim() !== "") return;
  await recordEnquiry({
    kind: "wholesale",
    name: input.contactName,
    email: input.email,
    phone: input.phone,
    businessName: input.businessName,
    businessType: input.businessType,
    location: input.location,
    taxId: input.taxId,
    message: input.message,
  });
}
