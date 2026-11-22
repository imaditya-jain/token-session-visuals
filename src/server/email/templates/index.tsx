import { z } from "zod";

import { CONTACT_TOPICS } from "@/lib/contact-schemas";
import { BUSINESS_TYPES } from "@/lib/wholesale-schemas";

import AccountDeleted from "./AccountDeleted";
import AdminInvite from "./AdminInvite";
import CampaignEmail from "./CampaignEmail";
import ContactMessage from "./ContactMessage";
import EnquiryReceived from "./EnquiryReceived";
import OrderUpdate from "./OrderUpdate";
import OtpCode from "./OtpCode";
import NewsletterConfirm from "./NewsletterConfirm";
import PasswordChanged from "./PasswordChanged";
import ResetPassword from "./ResetPassword";
import VerifyEmail from "./VerifyEmail";
import WholesaleApplication, { type WholesaleApplicationData } from "./WholesaleApplication";

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
  "otp-code": {
    subject: (data: { code: string }) => `${data.code} is your Fernwood sign-in code`,
    schema: z.object({
      firstName: z.string(),
      code: z.string().regex(/^\d{6}$/),
      minutes: z.number().int().positive().max(60),
      audience: z.enum(["admin", "customer"]),
    }),
    element: (data: {
      firstName: string;
      code: string;
      minutes: number;
      audience: "admin" | "customer";
    }) => <OtpCode {...data} />,
  },
  "admin-invite": {
    subject: "You're invited to the Fernwood admin",
    schema: z.object({
      firstName: z.string(),
      roleName: z.string().max(60),
      url: z.string().url(),
    }),
    element: (data: { firstName: string; roleName: string; url: string }) => (
      <AdminInvite {...data} />
    ),
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
      reference: z.string().max(30).optional(),
    }),
    element: (data: {
      name: string;
      email: string;
      topic: string;
      message: string;
      reference?: string | undefined;
    }) => <ContactMessage {...data} />,
    /** Lets the team answer the visitor with a plain "Reply". */
    replyTo: (data: { email: string }) => data.email,
  },
  "wholesale-application": {
    subject: (data: { businessName: string }) => `Wholesale application: ${data.businessName}`,
    schema: z.object({
      businessName: z.string().min(1).max(120),
      contactName: z.string().min(1).max(80),
      email: z.string().email(),
      phone: z.string().min(7).max(20),
      businessType: z.enum(BUSINESS_TYPES),
      location: z.string().min(1).max(120),
      taxId: z.string().max(40),
      message: z.string().min(1).max(3000),
      reference: z.string().max(30).optional(),
    }),
    element: (data: WholesaleApplicationData) => <WholesaleApplication {...data} />,
    /** Lets the team answer the applicant with a plain "Reply". */
    replyTo: (data: { email: string }) => data.email,
  },
  "enquiry-received": {
    subject: (data: { kind: "contact" | "wholesale"; reference: string }) =>
      `Fernwood: we've received your ${data.kind === "wholesale" ? "application" : "message"} (${data.reference})`,
    schema: z.object({
      kind: z.enum(["contact", "wholesale"]),
      name: z.string().min(1).max(120),
      reference: z.string().max(30),
    }),
    element: (data: { kind: "contact" | "wholesale"; name: string; reference: string }) => (
      <EnquiryReceived {...data} />
    ),
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
