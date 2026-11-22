"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import FormAlert from "@/components/auth/FormAlert";
import TextField from "@/components/auth/TextField";
import {
  fieldErrorsFromFailure,
  fieldErrorsFromZod,
  type FieldErrors,
} from "@/components/auth/useFormErrors";
import { Button } from "@/components/ui/button";
import { resetPassword } from "@/features/auth/authThunks";
import type { ApiFailure } from "@/features/auth/types";
import { resetPasswordSchema } from "@/lib/auth-schemas";
import { useAppDispatch } from "@/store/hooks";

const linkClass = "font-semibold text-forest underline-offset-4 hover:text-clay hover:underline";

/** `portal` picks which sign-in the links lead back to: the shop's, or the admin's own. */
export default function ResetPasswordForm({
  portal = "customer",
}: {
  portal?: "customer" | "admin";
}) {
  const base = portal === "admin" ? "/admin" : "";
  const dispatch = useAppDispatch();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <div role="alert" className="space-y-4 text-center">
        <p className="text-sm text-muted-foreground">
          This reset link is missing its code. Request a new one to continue.
        </p>
        <Link href={`${base}/forgot-password`} className={linkClass}>
          Request a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div role="status" className="space-y-4 text-center">
        <h2 className="font-display text-2xl font-medium text-forest">Password updated</h2>
        <p className="text-sm text-muted-foreground">
          You&apos;ve been signed out everywhere. Sign in with your new password.
        </p>
        <Button asChild className="h-11 w-full text-sm font-semibold">
          <Link href={`${base}/login`}>Sign in</Link>
        </Button>
      </div>
    );
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    const parsed = resetPasswordSchema.safeParse({ token, password });
    const next: FieldErrors = parsed.success ? {} : fieldErrorsFromZod(parsed.error);
    delete next["token"];
    if (confirm !== password) next["confirm"] = "Passwords don't match";
    if (Object.keys(next).length > 0 || !parsed.success) return setErrors(next);
    setErrors({});
    setPending(true);
    const result = await dispatch(resetPassword(parsed.data));
    setPending(false);
    if (resetPassword.rejected.match(result) && result.payload) {
      setErrors(fieldErrorsFromFailure(result.payload));
      setFailure(result.payload);
    } else {
      setDone(true);
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5" aria-busy={pending}>
      <FormAlert failure={failure} />
      {failure?.code === "invalid_token" ? (
        <p className="text-center text-sm">
          <Link href={`${base}/forgot-password`} className={linkClass}>
            Request a new link
          </Link>
        </p>
      ) : null}
      <TextField
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 10 characters."
        value={password}
        error={errors["password"]}
        onChange={(event) => setPassword(event.target.value)}
      />
      <TextField
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        required
        value={confirm}
        error={errors["confirm"]}
        onChange={(event) => setConfirm(event.target.value)}
      />
      <Button type="submit" disabled={pending} className="h-11 w-full text-sm font-semibold">
        {pending ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
