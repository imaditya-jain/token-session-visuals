"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ApiError, postJson } from "@/lib/api-client";

type State = { phase: "working" } | { phase: "done" } | { phase: "failed"; message: string };

/** Confirms the emailed subscription token once on load (it is single use). */
export default function NewsletterConfirmPanel() {
  const token = useSearchParams().get("token") ?? "";
  const started = useRef(false);
  const [state, setState] = useState<State>(
    token
      ? { phase: "working" }
      : { phase: "failed", message: "This confirmation link is missing its code." },
  );

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    postJson("/api/newsletter/confirm", { token })
      .then(() => setState({ phase: "done" }))
      .catch((error: unknown) =>
        setState({
          phase: "failed",
          message:
            error instanceof ApiError ? error.message : "We couldn't confirm your subscription.",
        }),
      );
  }, [token]);

  if (state.phase === "working") {
    return (
      <p role="status" aria-busy="true" className="text-center text-sm text-muted-foreground">
        Confirming your subscription…
      </p>
    );
  }
  if (state.phase === "done") {
    return (
      <div role="status" className="space-y-4 text-center">
        <h2 className="font-display text-2xl font-medium text-forest">You&apos;re in!</h2>
        <p className="text-sm text-muted-foreground">
          Welcome to the Greenhouse Club. Look out for our next note.
        </p>
        <Button asChild className="h-11 w-full text-sm font-semibold">
          <Link href="/shop">Browse the shop</Link>
        </Button>
      </div>
    );
  }
  return (
    <div role="alert" className="space-y-4 text-center">
      <p className="text-sm text-destructive">{state.message}</p>
      <p className="text-sm text-muted-foreground">
        Sign up again from the form at the bottom of any page to get a fresh link.
      </p>
      <Button asChild variant="outline" className="h-11 w-full text-sm font-semibold">
        <Link href="/">Back to the shop</Link>
      </Button>
    </div>
  );
}
