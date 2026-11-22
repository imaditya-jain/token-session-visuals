"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import CodeStep from "@/components/auth/CodeStep";
import FormAlert from "@/components/auth/FormAlert";
import TextField from "@/components/auth/TextField";
import {
  fieldErrorsFromFailure,
  fieldErrorsFromZod,
  type FieldErrors,
} from "@/components/auth/useFormErrors";
import { Button } from "@/components/ui/button";
import {
  loadAdminAccess,
  requestAdminCode,
  resendAdminCode,
  verifyAdminCode,
} from "@/features/admin/adminThunks";
import type { ApiFailure } from "@/features/auth/types";
import { loginSchema, type OtpChallenge } from "@/lib/auth-schemas";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

export default function AdminLoginForm() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const authStatus = useAppSelector((state) => state.auth.status);
  const adminStatus = useAppSelector((state) => state.admin.status);

  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [pending, setPending] = useState(false);
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);

  // Someone who is already signed in as an admin doesn't need this page.
  useEffect(() => {
    if (authStatus === "authenticated" && adminStatus === "idle") void dispatch(loadAdminAccess());
    if (adminStatus === "ready") router.replace("/admin");
  }, [authStatus, adminStatus, dispatch, router]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) return setErrors(fieldErrorsFromZod(parsed.error));
    setErrors({});
    setPending(true);
    const result = await dispatch(requestAdminCode(parsed.data));
    setPending(false);
    if (requestAdminCode.rejected.match(result)) {
      if (result.payload) {
        setErrors(fieldErrorsFromFailure(result.payload));
        setFailure(result.payload);
      }
      return;
    }
    setValues((v) => ({ ...v, password: "" }));
    setChallenge(result.payload);
  };

  const onVerify = async (code: string) => {
    if (!challenge) return;
    setFailure(null);
    setPending(true);
    const result = await dispatch(verifyAdminCode({ challenge: challenge.ref, code }));
    setPending(false);
    if (verifyAdminCode.rejected.match(result) && result.payload) setFailure(result.payload);
  };

  const onResend = async (): Promise<OtpChallenge | null> => {
    if (!challenge) return null;
    setFailure(null);
    const result = await dispatch(resendAdminCode(challenge.ref));
    if (resendAdminCode.rejected.match(result)) {
      if (result.payload) setFailure(result.payload);
      return null;
    }
    setChallenge(result.payload);
    return result.payload;
  };

  if (challenge) {
    return (
      <CodeStep
        email={values.email}
        challenge={challenge}
        failure={failure}
        pending={pending}
        onVerify={onVerify}
        onResend={onResend}
        onBack={() => {
          setChallenge(null);
          setFailure(null);
          setErrors({});
        }}
      />
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
          href="/admin/forgot-password"
          className="text-sm font-medium text-forest underline-offset-4 hover:text-clay hover:underline"
        >
          Forgot password?
        </Link>
      </div>
      <Button type="submit" disabled={pending} className="h-11 w-full text-sm font-semibold">
        {pending ? "Checking…" : "Continue"}
      </Button>
    </form>
  );
}
