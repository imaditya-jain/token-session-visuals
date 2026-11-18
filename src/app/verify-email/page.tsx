import type { Metadata } from "next";
import { Suspense } from "react";

import AuthShell from "@/components/auth/AuthShell";
import VerifyEmailPanel from "@/components/auth/VerifyEmailPanel";

export const metadata: Metadata = {
  title: "Confirm your email — Fernwood",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  alternates: { canonical: "/verify-email" },
};

export default function VerifyEmailPage() {
  return (
    <AuthShell eyebrow="Your account" title="Confirm your email">
      <Suspense>
        <VerifyEmailPanel />
      </Suspense>
    </AuthShell>
  );
}
