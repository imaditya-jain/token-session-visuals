import type { Metadata } from "next";

import AdminLoginForm from "@/components/admin/AdminLoginForm";

export const metadata: Metadata = { title: "Sign in", alternates: { canonical: "/admin/login" } };

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="font-display text-3xl text-forest">Fernwood</p>
          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">Admin</p>
          <h1 className="mt-6 font-display text-2xl text-forest">Sign in</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter your password, then the code we email you.
          </p>
        </div>
        <div className="rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border/60 sm:p-8">
          <AdminLoginForm />
        </div>
      </div>
    </main>
  );
}
