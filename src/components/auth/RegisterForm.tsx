"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import FormAlert from "@/components/auth/FormAlert";
import TextField from "@/components/auth/TextField";
import {
  fieldErrorsFromFailure,
  fieldErrorsFromZod,
  type FieldErrors,
} from "@/components/auth/useFormErrors";
import { useQueryParam } from "@/lib/use-query-param";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { register } from "@/features/auth/authThunks";
import type { ApiFailure } from "@/features/auth/types";
import { registerSchema } from "@/lib/auth-schemas";
import { safeRedirectPath } from "@/lib/redirect";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

export default function RegisterForm() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const status = useAppSelector((state) => state.auth.status);
  const next = safeRedirectPath(useQueryParam("next"));

  const [values, setValues] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    acceptsMarketing: false,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (status === "authenticated") router.replace(next);
  }, [status, next, router]);

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    const parsed = registerSchema.safeParse(values);
    if (!parsed.success) return setErrors(fieldErrorsFromZod(parsed.error));
    setErrors({});
    setPending(true);
    const result = await dispatch(register(parsed.data));
    setPending(false);
    if (register.rejected.match(result) && result.payload) {
      const fields = fieldErrorsFromFailure(result.payload);
      if (result.payload.code === "email_taken") fields["email"] = result.payload.message;
      setErrors(fields);
      setFailure(result.payload.code === "email_taken" ? null : result.payload);
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5" aria-busy={pending}>
      <FormAlert failure={failure} />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="First name"
          autoComplete="given-name"
          required
          value={values.firstName}
          error={errors["firstName"]}
          onChange={(event) => set("firstName", event.target.value)}
        />
        <TextField
          label="Last name"
          autoComplete="family-name"
          required
          value={values.lastName}
          error={errors["lastName"]}
          onChange={(event) => set("lastName", event.target.value)}
        />
      </div>
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        value={values.email}
        error={errors["email"]}
        onChange={(event) => set("email", event.target.value)}
      />
      <TextField
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 10 characters."
        value={values.password}
        error={errors["password"]}
        onChange={(event) => set("password", event.target.value)}
      />
      <label className="flex cursor-pointer items-start gap-3 text-sm text-muted-foreground">
        <Checkbox
          checked={values.acceptsMarketing}
          onCheckedChange={(checked) => set("acceptsMarketing", checked === true)}
          className="mt-0.5"
        />
        Send me care tips and early access to new arrivals.
      </label>
      <Button type="submit" disabled={pending} className="h-11 w-full text-sm font-semibold">
        {pending ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href={next === "/account" ? "/login" : `/login?next=${encodeURIComponent(next)}`}
          className="font-semibold text-forest underline-offset-4 hover:text-clay hover:underline"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
