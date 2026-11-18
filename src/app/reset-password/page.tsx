import type { Metadata } from "next";
import { Suspense } from "react";

import AuthShell from "@/components/auth/AuthShell";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

export const metadata: Metadata = {
  title: "Reset password — Fernwood",
  // The URL carries a one-time token: never indexed, and not sent to other sites as a referrer.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  alternates: { canonical: "/reset-password" },
};

export default function ResetPasswordPage() {
  return (
    <AuthShell eyebrow="Your account" title="Choose a new password">
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
