import type { Metadata } from "next";

import AuthShell from "@/components/auth/AuthShell";
import { getPageContent } from "@/server/services/page-content-public";
import RegisterForm from "@/components/auth/RegisterForm";

export const metadata: Metadata = {
  title: "Create account — Fernwood",
  description: "Create a Fernwood account.",
  robots: { index: false, follow: true },
  alternates: { canonical: "/register" },
};

export const revalidate = 3600;

export default async function RegisterPage() {
  const c = await getPageContent("register");
  return (
    <AuthShell
      eyebrow={c.text("header", "eyebrow")}
      title={c.text("header", "title")}
      description={c.text("intro", "description")}
    >
      <RegisterForm />
    </AuthShell>
  );
}
