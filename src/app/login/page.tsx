import type { Metadata } from "next";

import AuthShell from "@/components/auth/AuthShell";
import { getPageContent } from "@/server/services/page-content-public";
import LoginForm from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Sign in — Fernwood",
  description: "Sign in to your Fernwood account.",
  robots: { index: false, follow: true },
  alternates: { canonical: "/login" },
};

export const revalidate = 3600;

export default async function LoginPage() {
  const c = await getPageContent("login");
  return (
    <AuthShell
      eyebrow={c.text("header", "eyebrow")}
      title={c.text("header", "title")}
      description={c.text("intro", "description")}
    >
      <LoginForm />
    </AuthShell>
  );
}
