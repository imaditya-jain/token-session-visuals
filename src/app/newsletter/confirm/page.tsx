import type { Metadata } from "next";
import { Suspense } from "react";

import AuthShell from "@/components/auth/AuthShell";
import NewsletterConfirmPanel from "@/components/auth/NewsletterConfirmPanel";

export const metadata: Metadata = {
  title: "Confirm subscription — Fernwood",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function NewsletterConfirmPage() {
  return (
    <AuthShell eyebrow="Greenhouse Club" title="Confirm your subscription">
      <Suspense>
        <NewsletterConfirmPanel />
      </Suspense>
    </AuthShell>
  );
}
