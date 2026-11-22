"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import FormAlert from "@/components/auth/FormAlert";
import TextField from "@/components/auth/TextField";
import {
  fieldErrorsFromFailure,
  fieldErrorsFromZod,
  type FieldErrors,
} from "@/components/auth/useFormErrors";
import { useQueryParam } from "@/lib/use-query-param";
import { Button } from "@/components/ui/button";
import { requestLoginCode, resendLoginCode, verifyLoginCode } from "@/features/auth/authThunks";
import type { ApiFailure } from "@/features/auth/types";
import { loginSchema, otpCodeSchema, type OtpChallenge } from "@/lib/auth-schemas";
import { safeRedirectPath } from "@/lib/redirect";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

export default function LoginForm() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const status = useAppSelector((state) => state.auth.status);
  const next = safeRedirectPath(useQueryParam("next"));
  const accountDeleted = useQueryParam("deleted") === "1";

  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [pending, setPending] = useState(false);

  // Second step: set once the server accepted the password and emailed a code.
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [code, setCode] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const codeField = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === "authenticated") router.replace(next);
  }, [status, next, router]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  useEffect(() => {
    if (challenge) codeField.current?.querySelector("input")?.focus();
  }, [challenge]);

  const onSubmitCredentials = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) return setErrors(fieldErrorsFromZod(parsed.error));
    setErrors({});
    setPending(true);
    const result = await dispatch(requestLoginCode(parsed.data));
    setPending(false);
    if (requestLoginCode.rejected.match(result)) {
      if (result.payload) {
        setErrors(fieldErrorsFromFailure(result.payload));
        setFailure(result.payload);
      }
      return;
    }
    // The password is no longer needed once the server accepted it.
    setValues((v) => ({ ...v, password: "" }));
    setChallenge(result.payload);
    setResendIn(result.payload.resendAfter);
  };

  const onSubmitCode = async (event: FormEvent) => {
    event.preventDefault();
    if (!challenge) return;
    setFailure(null);
    const parsed = otpCodeSchema.safeParse(code);
    if (!parsed.success)
      return setErrors({ code: parsed.error.issues[0]?.message ?? "Invalid code" });
    setErrors({});
    setPending(true);
    const result = await dispatch(verifyLoginCode({ challenge: challenge.ref, code: parsed.data }));
    setPending(false);
    if (verifyLoginCode.rejected.match(result) && result.payload) setFailure(result.payload);
  };

  const onResend = async () => {
    if (!challenge || resendIn > 0) return;
    setFailure(null);
    const result = await dispatch(resendLoginCode(challenge.ref));
    if (resendLoginCode.rejected.match(result)) {
      if (result.payload) setFailure(result.payload);
      return;
    }
    setChallenge(result.payload);
    setResendIn(result.payload.resendAfter);
    setCode("");
  };

  const startOver = () => {
    setChallenge(null);
    setCode("");
    setErrors({});
    setFailure(null);
    setValues((v) => ({ ...v, password: "" }));
  };

  if (challenge) {
    const minutes = Math.round(challenge.expiresIn / 60);
    return (
      <form onSubmit={onSubmitCode} noValidate className="space-y-5" aria-busy={pending}>
        <p
          role="status"
          className="rounded-md border border-sage/50 bg-sage-light/50 px-4 py-3 text-sm text-forest"
        >
          We emailed a 6-digit code to <strong>{values.email.trim().toLowerCase()}</strong>. It
          expires in {minutes} minutes.
        </p>
        <FormAlert failure={failure} />
        <div ref={codeField}>
          <TextField
            label="Verification code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            pattern="[0-9]*"
            required
            value={code}
            error={errors["code"]}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          />
        </div>
        <Button type="submit" disabled={pending} className="h-11 w-full text-sm font-semibold">
          {pending ? "Verifying…" : "Verify and sign in"}
        </Button>
        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={onResend}
            disabled={resendIn > 0}
            className="font-medium text-forest underline-offset-4 hover:text-clay hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
          >
            {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
          </button>
          <button
            type="button"
            onClick={startOver}
            className="font-medium text-forest underline-offset-4 hover:text-clay hover:underline"
          >
            Use a different account
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmitCredentials} noValidate className="space-y-5" aria-busy={pending}>
      {accountDeleted ? (
        <p
          role="status"
          className="rounded-md border border-sage/50 bg-sage-light/50 px-4 py-3 text-sm text-forest"
        >
          Your account has been deleted. We&apos;ve emailed you a confirmation.
        </p>
      ) : null}
      <FormAlert failure={failure} />
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        value={values.email}
        error={errors["email"]}
        onChange={(event) => setValues((v) => ({ ...v, email: event.target.value }))}
      />
      <TextField
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        value={values.password}
        error={errors["password"]}
        onChange={(event) => setValues((v) => ({ ...v, password: event.target.value }))}
      />
      <div className="-mt-2 text-right">
        <Link
          href="/forgot-password"
          className="text-sm font-medium text-forest underline-offset-4 hover:text-clay hover:underline"
        >
          Forgot password?
        </Link>
      </div>
      <Button type="submit" disabled={pending} className="h-11 w-full text-sm font-semibold">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        New to Fernwood?{" "}
        <Link
          href={next === "/account" ? "/register" : `/register?next=${encodeURIComponent(next)}`}
          className="font-semibold text-forest underline-offset-4 hover:text-clay hover:underline"
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}
