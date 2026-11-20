"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import FormAlert from "@/components/auth/FormAlert";
import TextField from "@/components/auth/TextField";
import { Button } from "@/components/ui/button";
import { deleteMyAccount, exportMyData } from "@/features/auth/authThunks";
import type { ApiFailure } from "@/features/auth/types";
import { useAppDispatch } from "@/store/hooks";

const card = "rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border/60 sm:p-8";

function DownloadData() {
  const dispatch = useAppDispatch();
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");

  const download = async () => {
    setState("working");
    const result = await dispatch(exportMyData());
    setState(exportMyData.rejected.match(result) ? "error" : "done");
  };

  return (
    <section className={card} aria-labelledby="data-heading">
      <h2 id="data-heading" className="font-display text-2xl font-medium text-forest">
        Your data
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Download a copy of the personal data we hold about you: your details, signed-in devices,
        newsletter choices and orders.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Button
          variant="outline"
          disabled={state === "working"}
          onClick={download}
          className="h-11 px-7"
        >
          {state === "working" ? "Preparing…" : "Download my data"}
        </Button>
        <p role="status" className="text-sm font-medium text-forest">
          {state === "done" ? "Your file was downloaded." : ""}
        </p>
        {state === "error" ? (
          <p role="alert" className="text-sm text-destructive">
            Couldn&apos;t prepare your file right now. Please try again later.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function DeleteAccount() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  const reset = () => {
    setOpen(false);
    setPassword("");
    setFailure(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    setPending(true);
    const result = await dispatch(deleteMyAccount(password));
    setPending(false);
    if (deleteMyAccount.rejected.match(result)) {
      setFailure(result.payload ?? null);
      return;
    }
    router.replace("/login?deleted=1");
  };

  const wrongPassword = failure?.code === "invalid_password";

  return (
    <section
      className="rounded-2xl border border-destructive/30 bg-card p-6 sm:p-8"
      aria-labelledby="delete-heading"
    >
      <h2 id="delete-heading" className="font-display text-2xl font-medium text-forest">
        Delete account
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        This permanently deletes your account, signs you out everywhere, removes your newsletter
        subscription and asks our commerce provider to erase your customer record. Past orders are
        kept without any link to you, because we must keep financial records. This cannot be undone.
      </p>

      {open ? (
        <form onSubmit={submit} noValidate className="mt-6 space-y-5" aria-busy={pending}>
          {failure && !wrongPassword ? <FormAlert failure={failure} /> : null}
          <TextField
            label="Confirm with your password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            error={wrongPassword ? "That password is incorrect." : undefined}
            onChange={(event) => setPassword(event.target.value)}
          />
          <div className="flex flex-wrap gap-3">
            <Button
              type="submit"
              variant="destructive"
              disabled={pending || password.length === 0}
              className="h-11 px-7"
            >
              {pending ? "Deleting…" : "Permanently delete my account"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={reset}
              className="h-11 px-7"
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-6">
          <Button variant="outline" onClick={() => setOpen(true)} className="h-11 px-7">
            Delete my account…
          </Button>
        </div>
      )}
    </section>
  );
}

/** Privacy rights on the account page: download a copy of your data, or delete the account. */
export default function PrivacyPanel() {
  return (
    <>
      <DownloadData />
      <DeleteAccount />
    </>
  );
}
