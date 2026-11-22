"use client";

import Link from "next/link";

import ActivityList from "@/components/admin/ActivityList";
import PageHeader from "@/components/admin/PageHeader";
import { visibleNav } from "@/lib/admin-nav";
import { PERMISSIONS, SYSTEM_ROLES, isSystemRole } from "@/lib/permissions";
import { useAppSelector } from "@/store/hooks";

export default function DashboardPanel() {
  const user = useAppSelector((state) => state.auth.user);
  const access = useAppSelector((state) => state.admin.access);
  if (!access) return null;

  const roleName = isSystemRole(access.roleKey)
    ? SYSTEM_ROLES[access.roleKey].name
    : access.roleKey;
  const sections = visibleNav(access.permissions).filter((item) => item.href !== "/admin");

  return (
    <>
      <PageHeader
        title={`Welcome, ${user?.firstName ?? "there"}`}
        lead={`You are signed in as ${roleName}.`}
      />

      {sections.length > 0 ? (
        <section aria-labelledby="sections-heading" className="mb-12">
          <h2 id="sections-heading" className="mb-4 font-display text-xl text-forest">
            Where to go
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sections.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block h-full rounded-xl bg-card p-5 ring-1 ring-border/60 transition-shadow hover:shadow-md"
                >
                  <span className="font-display text-lg text-forest">{item.label}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {item.description}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="access-heading" className="mb-12">
        <h2 id="access-heading" className="mb-4 font-display text-xl text-forest">
          What your role allows
        </h2>
        {access.permissions.length === 0 ? (
          <p className="text-muted-foreground">This role has no permissions yet.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {access.permissions.map((permission) => (
              <li key={permission} className="text-sm text-foreground">
                <span className="mr-2 text-moss" aria-hidden>
                  •
                </span>
                {PERMISSIONS[permission]}
              </li>
            ))}
          </ul>
        )}
      </section>

      {access.permissions.includes("audit:read") ? (
        <section aria-labelledby="recent-heading">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 id="recent-heading" className="font-display text-xl text-forest">
              Recent activity
            </h2>
            <Link
              href="/admin/activity"
              className="text-sm font-medium text-forest underline-offset-4 hover:text-clay hover:underline"
            >
              See all
            </Link>
          </div>
          <ActivityList pageSize={8} paged={false} />
        </section>
      ) : null}
    </>
  );
}
