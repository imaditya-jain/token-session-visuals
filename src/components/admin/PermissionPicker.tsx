"use client";

import { PERMISSION_KEYS, PERMISSIONS, type Permission } from "@/lib/permissions";

/**
 * Checkbox list of every permission. Ones the editor doesn't hold themselves are disabled, mirroring the
 * server rule that nobody can grant access they don't have.
 */
export default function PermissionPicker({
  value,
  onChange,
  grantable,
}: {
  value: Permission[];
  onChange: (next: Permission[]) => void;
  grantable: readonly Permission[];
}) {
  const toggle = (permission: Permission, on: boolean) =>
    onChange(on ? [...value, permission] : value.filter((item) => item !== permission));

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-foreground">Permissions</legend>
      <div className="grid gap-1 sm:grid-cols-2">
        {PERMISSION_KEYS.map((permission) => {
          const allowed = grantable.includes(permission);
          return (
            <label
              key={permission}
              className={`flex min-h-11 items-start gap-3 rounded-md px-2 py-2 text-sm ${
                allowed ? "cursor-pointer hover:bg-muted" : "cursor-not-allowed opacity-50"
              }`}
              title={allowed ? undefined : "You can't grant a permission you don't have"}
            >
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--forest)]"
                checked={value.includes(permission)}
                disabled={!allowed}
                onChange={(event) => toggle(permission, event.target.checked)}
              />
              <span>{PERMISSIONS[permission]}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
