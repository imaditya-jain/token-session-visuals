import type { Metadata } from "next";

import AuthShell from "@/components/auth/AuthShell";
import LoginForm from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Sign in — Fernwood",
  description: "Sign in to your Fernwood account.",
  robots: { index: false, follow: true },
  alternates: { canonical: "/login" },
};

export default function LoginPage() {
  return (
    <AuthShell
      eyebrow="Your account"
      title="Welcome back"
      description="Sign in to see your details and keep shopping."
    >
      <LoginForm />
    </AuthShell>
  );
}
