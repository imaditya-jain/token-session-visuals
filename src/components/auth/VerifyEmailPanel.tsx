"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { confirmEmail } from "@/features/auth/authThunks";
import { useAppDispatch } from "@/store/hooks";

type State = "verifying" | "verified" | "failed";

/** Confirms the emailed token once on load. The token is single use, so the call must never run twice. */
export default function VerifyEmailPanel() {
  const dispatch = useAppDispatch();
  const token = useSearchParams().get("token") ?? "";
  const started = useRef(false);
  const [state, setState] = useState<State>(token ? "verifying" : "failed");
  const [message, setMessage] = useState("This confirmation link is missing its code.");

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    void dispatch(confirmEmail(token)).then((result) => {
      if (confirmEmail.rejected.match(result)) {
        setMessage(result.payload?.message ?? "We couldn't confirm your email.");
        setState("failed");
      } else {
        setState("verified");
      }
    });
  }, [token, dispatch]);

  if (state === "verifying") {
    return (
      <p role="status" aria-busy="true" className="text-center text-sm text-muted-foreground">
        Confirming your email…
      </p>
    );
  }

  if (state === "verified") {
    return (
      <div role="status" className="space-y-4 text-center">
        <h2 className="font-display text-2xl font-medium text-forest">Email confirmed</h2>
        <p className="text-sm text-muted-foreground">Thanks! Your account is all set.</p>
        <Button asChild className="h-11 w-full text-sm font-semibold">
          <Link href="/account">Go to my account</Link>
        </Button>
      </div>
    );
  }

  return (
    <div role="alert" className="space-y-4 text-center">
      <p className="text-sm text-destructive">{message}</p>
      <p className="text-sm text-muted-foreground">
        Sign in to your account and we&apos;ll send you a fresh link.
      </p>
      <Button asChild variant="outline" className="h-11 w-full text-sm font-semibold">
        <Link href="/login?next=/account">Sign in</Link>
      </Button>
    </div>
  );
}
