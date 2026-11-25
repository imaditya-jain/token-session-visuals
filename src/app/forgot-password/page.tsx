import type { Metadata } from "next";

import AuthShell from "@/components/auth/AuthShell";
import { getPageContent } from "@/server/services/page-content-public";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Forgot password — Fernwood",
  robots: { index: false, follow: true },
  alternates: { canonical: "/forgot-password" },
};

export const revalidate = 3600;

export default async function ForgotPasswordPage() {
  const c = await getPageContent("forgot-password");
  return (
    <AuthShell
      eyebrow={c.text("header", "eyebrow")}
      title={c.text("header", "title")}
      description={c.text("intro", "description")}
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
