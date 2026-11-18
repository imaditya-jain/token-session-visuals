import type { Metadata } from "next";

import AccountPanel from "@/components/auth/AccountPanel";
import AuthShell from "@/components/auth/AuthShell";

export const metadata: Metadata = {
  title: "My account — Fernwood",
  robots: { index: false, follow: false },
  alternates: { canonical: "/account" },
};

export default function AccountPage() {
  return (
    <AuthShell eyebrow="Your account" title="My account" wide>
      <AccountPanel />
    </AuthShell>
  );
}
