import "server-only";

import type { z } from "zod";

import type { contactSchema } from "@/lib/contact-schemas";
import { emailEnv } from "@/server/config/env";
import { enqueueEmail } from "@/server/email/outbox";
import { AppError } from "@/server/http/errors";
import { logger } from "@/server/logger";

type ContactInput = z.output<typeof contactSchema>;

/**
 * Queues a visitor's message to the shop inbox through the outbox (so it survives SMTP downtime).
 * Nothing is ever sent to the visitor's address, so the form can't be used to mail-bomb someone else.
 */
export async function submitContactMessage(input: ContactInput): Promise<void> {
  // Bots fill the hidden field; pretend success so they get no signal to adapt to.
  if (input.website.trim() !== "") return;

  let inbox: string;
  try {
    const env = emailEnv();
    inbox = env.CONTACT_INBOX ?? env.SMTP_EMAIL;
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error : String(error) },
      "Contact form: email not configured",
    );
    throw new AppError(
      503,
      "contact_unavailable",
      "We can't take messages right now. Please email us instead.",
      {
        "Retry-After": "60",
      },
    );
  }

  await enqueueEmail("contact-message", inbox, {
    name: input.name,
    email: input.email,
    topic: input.topic,
    message: input.message,
  });
}
