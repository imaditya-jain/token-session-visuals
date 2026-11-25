"use client";

import { useState, type FormEvent } from "react";

import PageHeader from "@/components/admin/PageHeader";
import { useAdminMutation } from "@/components/admin/useAdminApi";
import { useApiResource } from "@/components/account/useApiResource";
import TextField from "@/components/auth/TextField";
import { Button } from "@/components/ui/button";
import type { AdminUserView, RoleView } from "@/lib/admin-types";
import { inviteAdminSchema } from "@/lib/admin-schemas";
import { useAppSelector } from "@/store/hooks";
import Skeleton from "@/components/admin/Skeleton";

const selectClass =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export default function UsersPanel() {
  const me = useAppSelector((state) => state.auth.user?.id);
  const users = useApiResource<{ users: AdminUserView[] }>("/api/admin/users");
  const roles = useApiResource<{ roles: RoleView[] }>("/api/admin/roles");
  const mutation = useAdminMutation();
  const [showInvite, setShowInvite] = useState(false);
  const [invite, setInvite] = useState({
    email: "",
    firstName: "",
    lastName: "",
    roleKey: "editor",
  });
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (users.status === "loading" || roles.status === "loading") {
    return (
      <>
        <PageHeader title="Team" />
        <Skeleton variant="list" />
      </>
    );
  }
  if (users.status === "error" || roles.status === "error") {
    const failed = users.status === "error" ? users : roles;
    return (
      <>
        <PageHeader title="Team" />
        <div role="alert" className="text-sm text-destructive">
          {failed.status === "error" ? failed.message : ""}{" "}
          <button
            className="underline"
            onClick={() => {
              users.retry();
              roles.retry();
            }}
          >
            Try again
          </button>
        </div>
      </>
    );
  }

  const roleName = (key: string) => roles.data.roles.find((role) => role.key === key)?.name ?? key;

  const sendInvite = async (event: FormEvent) => {
    event.preventDefault();
    setNotice(null);
    const parsed = inviteAdminSchema.safeParse(invite);
    if (!parsed.success) return setFieldError(parsed.error.issues[0]?.message ?? "Check the form");
    setFieldError(null);
    const created = await mutation.run<{ user: AdminUserView }>(
      "/api/admin/users",
      "POST",
      parsed.data,
    );
    if (created) {
      setNotice(`Invitation sent to ${created.user.email}. The link works for 1 hour.`);
      setInvite({ email: "", firstName: "", lastName: "", roleKey: invite.roleKey });
      setShowInvite(false);
      users.retry();
      roles.retry();
    }
  };

  const patch = async (
    user: AdminUserView,
    body: { roleKey?: string | null; disabled?: boolean },
  ) => {
    setNotice(null);
    if (await mutation.run(`/api/admin/users/${user.id}`, "PATCH", body)) {
      users.retry();
      roles.retry();
    }
  };

  return (
    <>
      <PageHeader
        title="Team"
        lead="People who can sign in to the admin. Each sign-in needs their password and an emailed code."
        action={
          <Button
            onClick={() => setShowInvite((open) => !open)}
            className="h-11"
            aria-expanded={showInvite}
          >
            {showInvite ? "Close" : "Invite someone"}
          </Button>
        }
      />

      {notice ? (
        <p
          role="status"
          className="mb-6 rounded-md border border-sage/50 bg-sage-light/50 px-4 py-3 text-sm text-forest"
        >
          {notice}
        </p>
      ) : null}
      {mutation.error ? (
        <p
          role="alert"
          className="mb-6 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {mutation.error}
        </p>
      ) : null}

      {showInvite ? (
        <form
          onSubmit={sendInvite}
          noValidate
          aria-label="Invite an admin"
          className="mb-10 grid gap-4 rounded-xl bg-card p-5 ring-1 ring-border/60 sm:grid-cols-2"
        >
          <TextField
            label="Email"
            type="email"
            autoComplete="off"
            required
            value={invite.email}
            onChange={(event) => setInvite((v) => ({ ...v, email: event.target.value }))}
          />
          <div>
            <label
              htmlFor="invite-role"
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              Role
            </label>
            <select
              id="invite-role"
              className={selectClass}
              value={invite.roleKey}
              onChange={(event) => setInvite((v) => ({ ...v, roleKey: event.target.value }))}
            >
              {roles.data.roles.map((role) => (
                <option key={role.key} value={role.key}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>
          <TextField
            label="First name"
            autoComplete="off"
            required
            value={invite.firstName}
            onChange={(event) => setInvite((v) => ({ ...v, firstName: event.target.value }))}
          />
          <TextField
            label="Last name"
            autoComplete="off"
            required
            value={invite.lastName}
            onChange={(event) => setInvite((v) => ({ ...v, lastName: event.target.value }))}
          />
          {fieldError ? (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {fieldError}
            </p>
          ) : null}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={mutation.pending} className="h-11">
              {mutation.pending ? "Sending…" : "Send invitation"}
            </Button>
          </div>
        </form>
      ) : null}

      <ul className="divide-y divide-border rounded-xl bg-card ring-1 ring-border/60">
        {users.data.users.map((user) => {
          const self = user.id === me;
          return (
            <li
              key={user.id}
              className="flex flex-wrap items-center justify-between gap-4 px-4 py-4"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">
                  {user.firstName} {user.lastName}
                  {self ? <span className="ml-2 text-xs text-muted-foreground">(you)</span> : null}
                </p>
                <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {user.disabled
                    ? "Disabled"
                    : user.emailVerified
                      ? "Active"
                      : "Invitation not accepted yet"}
                </p>
              </div>
              {self ? (
                <p className="text-sm text-muted-foreground">{roleName(user.roleKey)}</p>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <div>
                    <label htmlFor={`role-${user.id}`} className="sr-only">
                      Role for {user.firstName} {user.lastName}
                    </label>
                    <select
                      id={`role-${user.id}`}
                      className={`${selectClass} sm:w-48`}
                      value={user.roleKey}
                      disabled={mutation.pending}
                      onChange={(event) => void patch(user, { roleKey: event.target.value })}
                    >
                      {roles.data.roles.map((role) => (
                        <option key={role.key} value={role.key}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    variant="outline"
                    className="h-11"
                    disabled={mutation.pending}
                    onClick={() => void patch(user, { disabled: !user.disabled })}
                  >
                    {user.disabled ? "Enable" : "Disable"}
                    <span className="sr-only">
                      {" "}
                      {user.firstName} {user.lastName}
                    </span>
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
