"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import FormAlert from "@/components/auth/FormAlert";
import TextField from "@/components/auth/TextField";
import {
  fieldErrorsFromFailure,
  fieldErrorsFromZod,
  type FieldErrors,
} from "@/components/auth/useFormErrors";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { logout, logoutAll, updateProfile } from "@/features/auth/authThunks";
import type { ApiFailure, AuthUser } from "@/features/auth/types";
import { profileSchema } from "@/lib/auth-schemas";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

const card = "rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border/60 sm:p-8";

function ProfileForm({ user }: { user: AuthUser }) {
  const dispatch = useAppDispatch();
  const [values, setValues] = useState({
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone ?? "",
    acceptsMarketing: user.acceptsMarketing,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => {
    setSaved(false);
    setValues((current) => ({ ...current, [key]: value }));
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    setSaved(false);
    const parsed = profileSchema.safeParse(values);
    if (!parsed.success) return setErrors(fieldErrorsFromZod(parsed.error));
    setErrors({});
    setPending(true);
    const result = await dispatch(updateProfile(parsed.data));
    setPending(false);
    if (updateProfile.rejected.match(result) && result.payload) {
      setErrors(fieldErrorsFromFailure(result.payload));
      setFailure(result.payload);
    } else {
      setSaved(true);
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
        value={user.email}
        readOnly
        hint="Contact us to change your email."
      />
      <TextField
        label="Phone (optional)"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        value={values.phone}
        error={errors["phone"]}
        onChange={(event) => set("phone", event.target.value)}
      />
      <label className="flex cursor-pointer items-start gap-3 text-sm text-muted-foreground">
        <Checkbox
          checked={values.acceptsMarketing}
          onCheckedChange={(checked) => set("acceptsMarketing", checked === true)}
          className="mt-0.5"
        />
        Send me care tips and early access to new arrivals.
      </label>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending} className="h-11 px-7 text-sm font-semibold">
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <p role="status" className="text-sm font-medium text-forest">
          {saved ? "Changes saved." : ""}
        </p>
      </div>
    </form>
  );
}

export default function AccountPanel() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { status, user } = useAppSelector((state) => state.auth);
  const [busy, setBusy] = useState<"out" | "all" | null>(null);

  useEffect(() => {
    if (status === "anonymous") router.replace("/login?next=/account");
  }, [status, router]);

  // The access token lives in memory only, so this page can't be personalized on the server.
  if (status !== "authenticated" || !user) {
    return (
      <div
        className={`${card} animate-pulse space-y-4`}
        aria-busy="true"
        aria-label="Loading your account"
      >
        <div className="h-5 w-1/3 rounded bg-muted" />
        <div className="h-11 rounded bg-muted" />
        <div className="h-11 rounded bg-muted" />
      </div>
    );
  }

  const signOut = async (everywhere: boolean) => {
    setBusy(everywhere ? "all" : "out");
    await dispatch(everywhere ? logoutAll() : logout());
    router.replace("/login");
  };

  return (
    <div className="space-y-6">
      <section className={card} aria-labelledby="details-heading">
        <h2 id="details-heading" className="font-display text-2xl font-medium text-forest">
          Your details
        </h2>
        <div className="mt-6">
          <ProfileForm key={user.id} user={user} />
        </div>
      </section>

      <section className={card} aria-labelledby="security-heading">
        <h2 id="security-heading" className="font-display text-2xl font-medium text-forest">
          Sign out
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Signed in as <span className="font-medium text-foreground">{user.email}</span>.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            variant="outline"
            disabled={busy !== null}
            onClick={() => signOut(false)}
            className="h-11 px-7"
          >
            {busy === "out" ? "Signing out…" : "Sign out"}
          </Button>
          <Button
            variant="outline"
            disabled={busy !== null}
            onClick={() => signOut(true)}
            className="h-11 px-7"
          >
            {busy === "all" ? "Signing out…" : "Sign out of all devices"}
          </Button>
        </div>
      </section>
    </div>
  );
}
