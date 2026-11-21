import { z } from "zod";

import { configureZodForBrowser } from "@/lib/zod-browser";

configureZodForBrowser();

export const subscribeSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address").max(254)),
});

export const newsletterTokenSchema = z.object({
  token: z.string().trim().min(20, "Invalid link").max(400, "Invalid link"),
});

export type SubscribeInput = z.infer<typeof subscribeSchema>;
