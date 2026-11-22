import type { Metadata } from "next";
import { Suspense } from "react";

import AdminAuthFrame from "@/components/admin/AdminAuthFrame";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

export const metadata: Metadata = {
  title: "Choose a password",
  // The URL carries a one-time token: never sent to other sites as a referrer.
  referrer: "no-referrer",
  alternates: { canonical: "/admin/reset-password" },
};

export default function AdminResetPasswordPage() {
  return (
    <AdminAuthFrame
      title="Choose a new password"
      description="Pick a password you don't use anywhere else. You'll sign in with it and an emailed code."
    >
      <Suspense>
        <ResetPasswordForm portal="admin" />
      </Suspense>
    </AdminAuthFrame>
  );
}
