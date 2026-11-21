import type { Metadata } from "next";

import AuthShell from "@/components/auth/AuthShell";
import RegisterForm from "@/components/auth/RegisterForm";

export const metadata: Metadata = {
  title: "Create account — Fernwood",
  description: "Create a Fernwood account.",
  robots: { index: false, follow: true },
  alternates: { canonical: "/register" },
};

export default function RegisterPage() {
  return (
    <AuthShell
      eyebrow="Join Fernwood"
      title="Create your account"
      description="Save your details for a faster checkout and easier plant care."
    >
      <RegisterForm />
    </AuthShell>
  );
}
