"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import FormAlert from "@/components/auth/FormAlert";
import TextField from "@/components/auth/TextField";
import { Button } from "@/components/ui/button";
import type { ApiFailure } from "@/features/auth/types";
import { otpCodeSchema, type OtpChallenge } from "@/lib/auth-schemas";

/**
 * The "enter the code we emailed you" screen shared by customer and admin sign-in. It owns the input, the
 * resend countdown and client-side validation; the parent decides what verifying and resending actually do.
 */
export default function CodeStep({
  email,
  challenge,
  failure,
  pending,
  onVerify,
  onResend,
  onBack,
}: {
  email: string;
  challenge: OtpChallenge;
  failure: ApiFailure | null;
  pending: boolean;
  onVerify: (code: string) => void;
  /** Resolves with the fresh challenge, or null when the resend was refused. */
  onResend: () => Promise<OtpChallenge | null>;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [resendIn, setResendIn] = useState(challenge.resendAfter);
  const [expiresIn, setExpiresIn] = useState(challenge.expiresIn);
  const field = useRef<HTMLDivElement>(null);

  useEffect(() => {
    field.current?.querySelector("input")?.focus();
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = otpCodeSchema.safeParse(code);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Invalid code");
    setError(undefined);
    onVerify(parsed.data);
  };

  const resend = async () => {
    if (resendIn > 0) return;
    const fresh = await onResend();
    if (!fresh) return;
    setResendIn(fresh.resendAfter);
    setExpiresIn(fresh.expiresIn);
    setCode("");
    setError(undefined);
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5" aria-busy={pending}>
      <p
        role="status"
        className="rounded-md border border-sage/50 bg-sage-light/50 px-4 py-3 text-sm text-forest"
      >
        We emailed a 6-digit code to <strong>{email.trim().toLowerCase()}</strong>. It expires in{" "}
        {Math.round(expiresIn / 60)} minutes.
      </p>
      <FormAlert failure={failure} />
      <div ref={field}>
        <TextField
          label="Verification code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          pattern="[0-9]*"
          required
          value={code}
          error={error}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
        />
      </div>
      <Button type="submit" disabled={pending} className="h-11 w-full text-sm font-semibold">
        {pending ? "Verifying…" : "Verify and sign in"}
      </Button>
      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={resend}
          disabled={resendIn > 0}
          className="font-medium text-forest underline-offset-4 hover:text-clay hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
        >
          {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="font-medium text-forest underline-offset-4 hover:text-clay hover:underline"
        >
          Use a different account
        </button>
      </div>
    </form>
  );
}
