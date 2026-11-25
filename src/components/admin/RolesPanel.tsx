"use client";

import { useState, type FormEvent } from "react";

import PageHeader from "@/components/admin/PageHeader";
import PermissionPicker from "@/components/admin/PermissionPicker";
import { useAdminMutation } from "@/components/admin/useAdminApi";
import { useApiResource } from "@/components/account/useApiResource";
import TextField from "@/components/auth/TextField";
import { Button } from "@/components/ui/button";
import type { RoleView } from "@/lib/admin-types";
import { PERMISSIONS, type Permission } from "@/lib/permissions";
import { roleKeyFromName } from "@/lib/role-key";
import { useAppSelector } from "@/store/hooks";
import Skeleton from "@/components/admin/Skeleton";

type Draft = { name: string; description: string; permissions: Permission[] };
const emptyDraft: Draft = { name: "", description: "", permissions: [] };

function RoleForm({
  initial,
  submitLabel,
  grantable,
  pending,
  onSubmit,
  onCancel,
}: {
  initial: Draft;
  submitLabel: string;
  grantable: readonly Permission[];
  pending: boolean;
  onSubmit: (draft: Draft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim()) return setError("Give the role a name.");
    if (!roleKeyFromName(draft.name))
      return setError("Use at least two letters or digits in the name.");
    setError(null);
    onSubmit(draft);
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <TextField
        label="Name"
        required
        value={draft.name}
        onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))}
      />
      <TextField
        label="Description"
        value={draft.description}
        onChange={(event) => setDraft((d) => ({ ...d, description: event.target.value }))}
      />
      <PermissionPicker
        value={draft.permissions}
        grantable={grantable}
        onChange={(permissions) => setDraft((d) => ({ ...d, permissions }))}
      />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-3">
        <Button type="submit" disabled={pending} className="h-11">
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} className="h-11">
          Cancel
        </Button>
      </div>
    </form>
  );
}

export default function RolesPanel() {
  const mine = useAppSelector((state) => state.admin.access?.permissions ?? []);
  const roles = useApiResource<{ roles: RoleView[] }>("/api/admin/roles");
  const mutation = useAdminMutation();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  if (roles.status === "loading") {
    return (
      <>
        <PageHeader title="Roles" />
        <Skeleton variant="list" />
      </>
    );
  }
  if (roles.status === "error") {
    return (
      <>
        <PageHeader title="Roles" />
        <div role="alert" className="text-sm text-destructive">
          {roles.message}{" "}
          <button className="underline" onClick={roles.retry}>
            Try again
          </button>
        </div>
      </>
    );
  }

  const create = async (draft: Draft) => {
    const made = await mutation.run("/api/admin/roles", "POST", {
      key: roleKeyFromName(draft.name),
      name: draft.name,
      description: draft.description,
      permissions: draft.permissions,
    });
    if (made) {
      setCreating(false);
      roles.retry();
    }
  };

  const save = async (role: RoleView, draft: Draft) => {
    const done = await mutation.run(
      `/api/admin/roles/${encodeURIComponent(role.key)}`,
      "PATCH",
      draft,
    );
    if (done) {
      setEditing(null);
      roles.retry();
    }
  };

  const remove = async (role: RoleView) => {
    const done = await mutation.run(`/api/admin/roles/${encodeURIComponent(role.key)}`, "DELETE");
    setConfirmDelete(null);
    if (done) roles.retry();
  };

  return (
    <>
      <PageHeader
        title="Roles"
        lead="A role is a named set of permissions. Super Admin and Editor are built in; add your own for narrower access."
        action={
          <Button
            onClick={() => setCreating((open) => !open)}
            className="h-11"
            aria-expanded={creating}
          >
            {creating ? "Close" : "New role"}
          </Button>
        }
      />

      {mutation.error ? (
        <p
          role="alert"
          className="mb-6 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {mutation.error}
        </p>
      ) : null}

      {creating ? (
        <section
          aria-label="New role"
          className="mb-10 rounded-xl bg-card p-5 ring-1 ring-border/60"
        >
          <RoleForm
            initial={emptyDraft}
            submitLabel="Create role"
            grantable={mine}
            pending={mutation.pending}
            onSubmit={create}
            onCancel={() => setCreating(false)}
          />
        </section>
      ) : null}

      <ul className="space-y-4">
        {roles.data.roles.map((role) => (
          <li key={role.key} className="rounded-xl bg-card p-5 ring-1 ring-border/60">
            {editing === role.key ? (
              <RoleForm
                initial={{
                  name: role.name,
                  description: role.description,
                  permissions: role.permissions,
                }}
                submitLabel="Save changes"
                grantable={mine}
                pending={mutation.pending}
                onSubmit={(draft) => void save(role, draft)}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-xl text-forest">
                      {role.name}
                      {role.system ? (
                        <span className="ml-3 rounded-full bg-muted px-2 py-0.5 align-middle font-sans text-xs text-muted-foreground">
                          Built in
                        </span>
                      ) : null}
                    </h2>
                    {role.description ? (
                      <p className="mt-1 text-sm text-muted-foreground">{role.description}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {role.userCount} {role.userCount === 1 ? "person" : "people"}
                    </p>
                  </div>
                  {role.system ? null : (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="h-11"
                        onClick={() => setEditing(role.key)}
                      >
                        Edit<span className="sr-only"> {role.name}</span>
                      </Button>
                      {confirmDelete === role.key ? (
                        <Button
                          variant="destructive"
                          className="h-11"
                          disabled={mutation.pending}
                          onClick={() => void remove(role)}
                        >
                          Confirm delete<span className="sr-only"> {role.name}</span>
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          className="h-11"
                          onClick={() => setConfirmDelete(role.key)}
                        >
                          Delete<span className="sr-only"> {role.name}</span>
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {role.permissions.length === 0 ? (
                    <li className="text-sm text-muted-foreground">No permissions</li>
                  ) : (
                    role.permissions.map((permission) => (
                      <li
                        key={permission}
                        className="rounded-full bg-muted px-3 py-1 text-xs text-foreground"
                      >
                        {PERMISSIONS[permission]}
                      </li>
                    ))
                  )}
                </ul>
              </>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
