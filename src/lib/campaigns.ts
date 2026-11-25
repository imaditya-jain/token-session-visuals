import { z } from "zod";

import { DESIGNS } from "@/lib/email-designs";
import { configureZodForBrowser } from "@/lib/zod-browser";

configureZodForBrowser();

export const CAMPAIGN_STATUSES = ["draft", "scheduled", "sending", "sent"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

const noControl = (value: string) => ![...value].some((c) => c.charCodeAt(0) < 32 && c !== "\n");
const line = (max: number) =>
  z.string().trim().max(max).refine(noControl, "Remove special characters");

export const campaignGid = z.string().regex(/^[a-f0-9]{24}$/, "Invalid campaign id");

const httpsUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => {
    try {
      return new URL(v).protocol === "https:";
    } catch {
      return false;
    }
  }, "Use a full https:// address");

const imageUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => {
    try {
      const url = new URL(v);
      return url.protocol === "https:" && url.hostname === "cdn.shopify.com";
    } catch {
      return false;
    }
  }, "Choose a picture from the media library");

export const campaignContentSchema = z.object({
  eyebrow: line(60).default(""),
  heading: line(150).pipe(z.string().min(1, "Add a heading")),
  paragraphs: z
    .array(line(2000).pipe(z.string().min(1)))
    .min(1, "Add some text")
    .max(12),
  image: z
    .object({ src: imageUrl, alt: line(200) })
    .nullable()
    .default(null),
  cta: z
    .object({ label: line(60).pipe(z.string().min(1)), url: httpsUrl })
    .nullable()
    .default(null),
  signoff: line(120).default(""),
});
export type CampaignContent = z.infer<typeof campaignContentSchema>;

export const campaignInputSchema = z.object({
  name: line(120).pipe(z.string().min(1, "Give the campaign a name")),
  subject: line(150).pipe(z.string().min(1, "Add a subject")),
  preheader: line(200).default(""),
  design: z.string().refine((id) => DESIGNS.some((d) => d.id === id), "Choose a design"),
  content: campaignContentSchema,
});
export type CampaignInput = z.infer<typeof campaignInputSchema>;

export const scheduleSchema = z.object({
  /** ISO time at least a few minutes ahead. */
  at: z.string().datetime({ offset: true }),
});

export const previewSchema = z.object({
  design: campaignInputSchema.shape.design,
  subject: campaignInputSchema.shape.subject.optional(),
  preheader: campaignInputSchema.shape.preheader.optional(),
  content: campaignContentSchema,
});

export type CampaignListItem = {
  id: string;
  name: string;
  subject: string;
  design: string;
  status: CampaignStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  updatedAt: string;
  stats: CampaignStats | null;
};

export type CampaignStats = {
  queued: number;
  skipped: number;
  delivered: number;
  failed: number;
  pending: number;
};

export type CampaignDetail = CampaignListItem & {
  preheader: string;
  content: CampaignContent;
};
