import type { Metadata } from "next";

import AdminAuthFrame from "@/components/admin/AdminAuthFrame";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Forgot password",
  alternates: { canonical: "/admin/forgot-password" },
};

export default function AdminForgotPasswordPage() {
  return (
    <AdminAuthFrame
      title="Forgot your password?"
      description="Enter your email and we'll send you a link to choose a new one."
    >
      <ForgotPasswordForm portal="admin" />
    </AdminAuthFrame>
  );
}
