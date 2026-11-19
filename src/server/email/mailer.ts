import "server-only";

import { render } from "@react-email/render";
import nodemailer, { type SendMailOptions } from "nodemailer";
import type { ReactElement } from "react";

import { emailEnv } from "@/server/config/env";

import { type TemplateData, type TemplateName, templates } from "./templates";

type Transport = { sendMail(message: SendMailOptions): Promise<unknown> };

let transport: Transport | undefined;

function getTransport(): Transport {
  if (transport) return transport;
  const env = emailEnv();
  transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_EMAIL, pass: env.SMTP_PASS },
    connectionTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transport;
}

/** Test hook: replace the SMTP transport. */
export function setTransportForTests(next: Transport | undefined): void {
  transport = next;
}

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
  replyTo?: string;
};

/** Validates the data against the template's schema and renders HTML + plain text. */
export async function renderEmail<T extends TemplateName>(
  template: T,
  data: unknown,
): Promise<RenderedEmail> {
  const entry = templates[template];
  const parsed = entry.schema.parse(data) as TemplateData<T>;
  const element = (entry.element as (value: TemplateData<T>) => ReactElement)(parsed);
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  const subject =
    typeof entry.subject === "function"
      ? (entry.subject as (value: TemplateData<T>) => string)(parsed)
      : entry.subject;
  const headers =
    "headers" in entry
      ? (entry.headers as (value: TemplateData<T>) => Record<string, string>)(parsed)
      : {};
  const replyTo =
    "replyTo" in entry ? (entry.replyTo as (value: TemplateData<T>) => string)(parsed) : undefined;
  return { subject, html, text, headers, ...(replyTo ? { replyTo } : {}) };
}

export async function sendEmail(to: string, template: TemplateName, data: unknown): Promise<void> {
  const { SMTP_EMAIL, SMTP_FROM_NAME } = emailEnv();
  const { subject, html, text, headers, replyTo } = await renderEmail(template, data);
  await getTransport().sendMail({
    from: { name: SMTP_FROM_NAME, address: SMTP_EMAIL },
    to,
    subject,
    html,
    text,
    headers,
    ...(replyTo ? { replyTo } : {}),
  });
}
