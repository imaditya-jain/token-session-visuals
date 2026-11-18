"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import type { AuthUser } from "@/features/auth/types";
import { useAppSelector } from "@/store/hooks";

/** Redirects anonymous visitors to sign-in (returning here afterwards). Resolves the user once known. */
export function useRequireAuth(nextPath: string): AuthUser | null {
  const router = useRouter();
  const { status, user } = useAppSelector((state) => state.auth);

  useEffect(() => {
    if (status === "anonymous") router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
  }, [status, router, nextPath]);

  return status === "authenticated" ? user : null;
}
