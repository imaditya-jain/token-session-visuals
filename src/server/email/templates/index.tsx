import { z } from "zod";

import { CONTACT_TOPICS } from "@/lib/contact-schemas";

import AccountDeleted from "./AccountDeleted";
import CampaignEmail from "./CampaignEmail";
import ContactMessage from "./ContactMessage";
import OrderUpdate from "./OrderUpdate";
import NewsletterConfirm from "./NewsletterConfirm";
import PasswordChanged from "./PasswordChanged";
import ResetPassword from "./ResetPassword";
import VerifyEmail from "./VerifyEmail";

const https = z
  .string()
  .url()
  .refine(
    (value) => value.startsWith("https://") || value.startsWith("http://localhost"),
    "Links must use https",
  );

const campaignSchema = z.object({
  subject: z.string().min(1).max(150),
  preheader: z.string().max(200).optional(),
  heading: z.string().min(1).max(150),
  paragraphs: z.array(z.string().min(1).max(2000)).min(1).max(20),
  cta: z.object({ label: z.string().min(1).max(60), url: https }).optional(),
  unsubscribeUrl: z.string().url(),
  oneClickUrl: z.string().url(),
});

/**
 * Every email Fernwood can send: subject, validated data shape and renderer. Add new emails here.
 * `headers` adds message headers (e.g. List-Unsubscribe for marketing).
 */
export const templates = {
  "verify-email": {
    subject: "Confirm your Fernwood email",
    schema: z.object({ firstName: z.string(), url: z.string().url() }),
    element: (data: { firstName: string; url: string }) => <VerifyEmail {...data} />,
  },
  "reset-password": {
    subject: "Reset your Fernwood password",
    schema: z.object({ firstName: z.string(), url: z.string().url() }),
    element: (data: { firstName: string; url: string }) => <ResetPassword {...data} />,
  },
  "password-changed": {
    subject: "Your Fernwood password was changed",
    schema: z.object({ firstName: z.string() }),
    element: (data: { firstName: string }) => <PasswordChanged {...data} />,
  },
  "account-deleted": {
    subject: "Your Fernwood account has been deleted",
    schema: z.object({ firstName: z.string() }),
    element: (data: { firstName: string }) => <AccountDeleted {...data} />,
  },
  "order-update": {
    subject: (data: { headline: string }) => data.headline,
    schema: z.object({
      firstName: z.string(),
      orderName: z.string().max(40),
      headline: z.string().max(200),
      message: z.string().max(500),
      url: z.string().url(),
    }),
    element: (data: {
      firstName: string;
      orderName: string;
      headline: string;
      message: string;
      url: string;
    }) => <OrderUpdate {...data} />,
  },
  "newsletter-confirm": {
    subject: "Confirm your Fernwood subscription",
    schema: z.object({ url: z.string().url() }),
    element: (data: { url: string }) => <NewsletterConfirm {...data} />,
  },
  "contact-message": {
    subject: (data: { name: string; topic: string }) =>
      `Website message: ${data.topic} (${data.name})`,
    schema: z.object({
      name: z.string().min(1).max(80),
      email: z.string().email(),
      topic: z.enum(CONTACT_TOPICS),
      message: z.string().min(1).max(3000),
    }),
    element: (data: { name: string; email: string; topic: string; message: string }) => (
      <ContactMessage {...data} />
    ),
    /** Lets the team answer the visitor with a plain "Reply". */
    replyTo: (data: { email: string }) => data.email,
  },
  campaign: {
    subject: (data: { subject: string }) => data.subject,
    schema: campaignSchema,
    element: (data: z.infer<typeof campaignSchema>) => <CampaignEmail {...data} />,
    headers: (data: { oneClickUrl: string }) => ({
      // RFC 8058 one-click unsubscribe: mailbox providers show their own "Unsubscribe" button.
      "List-Unsubscribe": `<${data.oneClickUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    }),
  },
} as const;

export type TemplateName = keyof typeof templates;
export type TemplateData<T extends TemplateName> = z.infer<(typeof templates)[T]["schema"]>;
