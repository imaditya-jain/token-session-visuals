import type { Metadata } from "next";

import AdminAuthFrame from "@/components/admin/AdminAuthFrame";
import AdminLoginForm from "@/components/admin/AdminLoginForm";

export const metadata: Metadata = { title: "Sign in", alternates: { canonical: "/admin/login" } };

export default function AdminLoginPage() {
  return (
    <AdminAuthFrame title="Sign in" description="Enter your password, then the code we email you.">
      <AdminLoginForm />
    </AdminAuthFrame>
  );
}
