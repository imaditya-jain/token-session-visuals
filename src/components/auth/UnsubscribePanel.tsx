"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ApiError, postJson } from "@/lib/api-client";

type State = { phase: "idle" | "working" | "done" } | { phase: "failed"; message: string };

/**
 * Unsubscribes only when the person presses the button. Doing it on page load would let email security
 * scanners (which open every link) unsubscribe people by accident.
 */
export default function UnsubscribePanel() {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<State>(
    token ? { phase: "idle" } : { phase: "failed", message: "This unsubscribe link is invalid." },
  );

  const unsubscribe = async () => {
    setState({ phase: "working" });
    try {
      await postJson("/api/newsletter/unsubscribe", { token });
      setState({ phase: "done" });
    } catch (error) {
      setState({
        phase: "failed",
        message:
          error instanceof ApiError
            ? error.message
            : "We couldn't unsubscribe you right now. Please try again.",
      });
    }
  };

  if (state.phase === "done") {
    return (
      <div role="status" className="space-y-4 text-center">
        <h2 className="font-display text-2xl font-medium text-forest">
          You&apos;ve been unsubscribed
        </h2>
        <p className="text-sm text-muted-foreground">
          You won&apos;t receive any more emails from our newsletter. Order and account emails will
          still reach you.
        </p>
        <Button asChild variant="outline" className="h-11 w-full text-sm font-semibold">
          <Link href="/">Back to the shop</Link>
        </Button>
      </div>
    );
  }
  if (state.phase === "failed") {
    return (
      <div role="alert" className="space-y-4 text-center">
        <p className="text-sm text-destructive">{state.message}</p>
        {token ? (
          <Button onClick={unsubscribe} className="h-11 w-full text-sm font-semibold">
            Try again
          </Button>
        ) : null}
      </div>
    );
  }
  return (
    <div className="space-y-4 text-center">
      <p className="text-sm text-muted-foreground">
        Are you sure you want to stop receiving the Fernwood newsletter?
      </p>
      <Button
        onClick={unsubscribe}
        disabled={state.phase === "working"}
        className="h-11 w-full text-sm font-semibold"
      >
        {state.phase === "working" ? "Unsubscribing…" : "Unsubscribe"}
      </Button>
    </div>
  );
}
