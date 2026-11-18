import { z } from "zod";

import NewsletterConfirm from "./NewsletterConfirm";
import PasswordChanged from "./PasswordChanged";
import ResetPassword from "./ResetPassword";
import VerifyEmail from "./VerifyEmail";

/** Every email Fernwood can send: subject, validated data shape and renderer. Add new emails here. */
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
  "newsletter-confirm": {
    subject: "Confirm your Fernwood subscription",
    schema: z.object({ url: z.string().url() }),
    element: (data: { url: string }) => <NewsletterConfirm {...data} />,
  },
} as const;

export type TemplateName = keyof typeof templates;
export type TemplateData<T extends TemplateName> = z.infer<(typeof templates)[T]["schema"]>;
