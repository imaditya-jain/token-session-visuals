"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import FormAlert from "@/components/auth/FormAlert";
import TextField from "@/components/auth/TextField";
import {
  fieldErrorsFromFailure,
  fieldErrorsFromZod,
  type FieldErrors,
} from "@/components/auth/useFormErrors";
import { Button } from "@/components/ui/button";
import { login } from "@/features/auth/authThunks";
import type { ApiFailure } from "@/features/auth/types";
import { loginSchema } from "@/lib/auth-schemas";
import { safeRedirectPath } from "@/lib/redirect";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

export default function LoginForm() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const status = useAppSelector((state) => state.auth.status);
  const next = safeRedirectPath(useSearchParams().get("next"));

  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (status === "authenticated") router.replace(next);
  }, [status, next, router]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) return setErrors(fieldErrorsFromZod(parsed.error));
    setErrors({});
    setPending(true);
    const result = await dispatch(login(parsed.data));
    setPending(false);
    if (login.rejected.match(result) && result.payload) {
      setErrors(fieldErrorsFromFailure(result.payload));
      setFailure(result.payload);
    }
  };

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
