"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { loadAdminAccess } from "@/features/admin/adminThunks";
import { logout } from "@/features/auth/authThunks";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import AdminShell from "./AdminShell";
import Skeleton from "@/components/admin/Skeleton";

function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl bg-card p-8 text-center shadow-sm ring-1 ring-border/60">
        <h1 className="font-display text-2xl text-forest">{title}</h1>
        <div className="mt-3 space-y-5 text-sm text-muted-foreground">{children}</div>
      </div>
    </main>
  );
}

/**
 * Client-side gate for the console. The session lives in memory, so the page can only learn who is signed in
 * after load: it sends anonymous visitors to the admin sign-in and shows the shell only to admins. This is a
 * convenience: every admin API call is authorised again on the server.
 */
export default function AdminGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const authStatus = useAppSelector((state) => state.auth.status);
  const userId = useAppSelector((state) => state.auth.user?.id);
  const admin = useAppSelector((state) => state.admin);

  useEffect(() => {
    if (authStatus === "anonymous") router.replace("/admin/login");
  }, [authStatus, router]);

  useEffect(() => {
    if (authStatus === "authenticated" && admin.status === "idle") void dispatch(loadAdminAccess());
  }, [authStatus, admin.status, userId, dispatch]);

  const signOut = async () => {
    await dispatch(logout());
    router.replace("/admin/login");
  };

  if (admin.status === "ready" && admin.access && authStatus === "authenticated") {
    return <AdminShell access={admin.access}>{children}</AdminShell>;
  }
  if (admin.status === "denied") {
    return (
      <Notice title="No admin access">
        <p>This account isn&apos;t an administrator. Ask a Super Admin to invite you.</p>
        <Button onClick={signOut} variant="outline" className="h-11">
          Sign out
        </Button>
      </Notice>
    );
  }
  if (admin.status === "error") {
    return (
      <Notice title="Couldn't load the admin">
        <p>Check your connection and try again.</p>
        <Button onClick={() => dispatch(loadAdminAccess())} className="h-11">
          Try again
        </Button>
      </Notice>
    );
  }
  return (
    <div className="flex min-h-screen bg-background">
      <div aria-hidden="true" className="hidden w-64 shrink-0 bg-forest-deep p-6 lg:block">
        <div className="mb-8 h-7 w-28 rounded-md bg-white/10 motion-safe:animate-pulse" />
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="mb-3 h-8 rounded-md bg-white/5 motion-safe:animate-pulse" />
        ))}
      </div>
      <main className="min-w-0 flex-1 p-6 sm:p-10">
        <Skeleton variant="list" />
      </main>
    </div>
  );
}
