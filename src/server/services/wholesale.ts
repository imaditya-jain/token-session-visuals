import "server-only";

import type { z } from "zod";

import type { wholesaleSchema } from "@/lib/wholesale-schemas";
import { emailEnv } from "@/server/config/env";
import { enqueueEmail } from "@/server/email/outbox";
import { AppError } from "@/server/http/errors";
import { logger } from "@/server/logger";

type WholesaleInput = z.output<typeof wholesaleSchema>;

/**
 * Queues a trade application to the shop inbox through the outbox (it survives SMTP downtime). The owner reviews
 * it and, if approved, sets the business up as a Shopify B2B company with its own catalog and price list.
 * Nothing is sent to the applicant's address, so the form can't be used to mail-bomb someone else.
 */
export async function submitWholesaleApplication(input: WholesaleInput): Promise<void> {
  // Bots fill the hidden field; pretend success so they get no signal to adapt to.
  if (input.website.trim() !== "") return;

  let inbox: string;
  try {
    const env = emailEnv();
    inbox = env.CONTACT_INBOX ?? env.SMTP_EMAIL;
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error : String(error) },
      "Wholesale form: email not configured",
    );
    throw new AppError(
      503,
      "wholesale_unavailable",
      "We can't take applications right now. Please email us instead.",
      { "Retry-After": "60" },
    );
  }

  await enqueueEmail("wholesale-application", inbox, {
    businessName: input.businessName,
    contactName: input.contactName,
    email: input.email,
    phone: input.phone,
    businessType: input.businessType,
    location: input.location,
    taxId: input.taxId,
    message: input.message,
  });
}
