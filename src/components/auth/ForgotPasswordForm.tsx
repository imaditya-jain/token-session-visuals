"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import FormAlert from "@/components/auth/FormAlert";
import TextField from "@/components/auth/TextField";
import { fieldErrorsFromZod, type FieldErrors } from "@/components/auth/useFormErrors";
import { Button } from "@/components/ui/button";
import { forgotPassword } from "@/features/auth/authThunks";
import type { ApiFailure } from "@/features/auth/types";
import { forgotPasswordSchema } from "@/lib/auth-schemas";
import { useAppDispatch } from "@/store/hooks";

export default function ForgotPasswordForm() {
  const dispatch = useAppDispatch();
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) return setErrors(fieldErrorsFromZod(parsed.error));
    setErrors({});
    setPending(true);
    const result = await dispatch(forgotPassword(parsed.data));
    setPending(false);
    if (forgotPassword.rejected.match(result) && result.payload) setFailure(result.payload);
    else setSentTo(parsed.data.email);
  };

  if (sentTo) {
    return (
      <div role="status" className="space-y-4 text-center">
        <h2 className="font-display text-2xl font-medium text-forest">Check your inbox</h2>
        <p className="text-sm text-muted-foreground">
          If an account exists for <span className="font-medium text-foreground">{sentTo}</span>,
          we&apos;ve sent a link to reset your password. It expires in 1 hour.
        </p>
        <p className="text-sm text-muted-foreground">
          Nothing there? Check your spam folder, or{" "}
          <button
            type="button"
            onClick={() => setSentTo(null)}
            className="font-semibold text-forest underline-offset-4 hover:text-clay hover:underline"
          >
            try again
          </button>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5" aria-busy={pending}>
      <FormAlert failure={failure} />
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        value={email}
        error={errors["email"]}
        onChange={(event) => setEmail(event.target.value)}
      />
      <Button type="submit" disabled={pending} className="h-11 w-full text-sm font-semibold">
        {pending ? "Sending…" : "Send reset link"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link
          href="/login"
          className="font-semibold text-forest underline-offset-4 hover:text-clay hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
