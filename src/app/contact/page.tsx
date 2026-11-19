import type { Metadata } from "next";
import { Suspense } from "react";

import AuthShell from "@/components/auth/AuthShell";
import ContactForm from "@/components/contact/ContactForm";

export const metadata: Metadata = {
  title: "Contact us — Fernwood",
  description: "Questions about an order, a plant or wholesale? Send us a message.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <AuthShell
      eyebrow="Help"
      title="Contact us"
      description="Questions about an order, a plant that needs rescuing, or wholesale? We reply within one business day."
    >
      <Suspense>
        <ContactForm />
      </Suspense>
    </AuthShell>
  );
}
