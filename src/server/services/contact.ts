import "server-only";

import type { z } from "zod";

import type { contactSchema } from "@/lib/contact-schemas";
import { recordEnquiry } from "@/server/services/enquiries";

type ContactInput = z.output<typeof contactSchema>;

/**
 * Saves a visitor's message (the source of truth, shown in the admin), then queues the notification to the shop
 * inbox and a one-per-day thank-you to the sender. See `recordEnquiry`.
 */
export async function submitContactMessage(input: ContactInput): Promise<void> {
  // Bots fill the hidden field; pretend success so they get no signal to adapt to.
  if (input.website.trim() !== "") return;
  await recordEnquiry({
    kind: "contact",
    name: input.name,
    email: input.email,
    topic: input.topic,
    message: input.message,
  });
}
