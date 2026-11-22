"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { AdminAccess } from "@/features/admin/adminSlice";
import { clearAdminAccess } from "@/features/admin/adminThunks";
import { logout } from "@/features/auth/authThunks";
import { isActiveNav, visibleNavGroups } from "@/lib/admin-nav";
import { SYSTEM_ROLES, isSystemRole } from "@/lib/permissions";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

function NavLinks({ access, onNavigate }: { access: AdminAccess; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin sections" className="space-y-5">
      {visibleNavGroups(access.permissions).map((group) => (
        <div
          key={group.id}
          {...(group.label ? { role: "group", "aria-labelledby": `nav-group-${group.id}` } : {})}
        >
          {group.label ? (
            <p
              id={`nav-group-${group.id}`}
              className="mb-1 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-cream/65"
            >
              {group.label}
            </p>
          ) : null}
          <ul className="space-y-1">
            {group.items.map((item) => {
              const active = isActiveNav(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    {...(onNavigate ? { onClick: onNavigate } : {})}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors ${
                      group.label ? "ml-2" : ""
                    } ${
                      active
                        ? "bg-cream/15 text-cream"
                        : "text-cream/75 hover:bg-cream/10 hover:text-cream"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Identity({ access }: { access: AdminAccess }) {
  const user = useAppSelector((state) => state.auth.user);
  const roleName = isSystemRole(access.roleKey)
    ? SYSTEM_ROLES[access.roleKey].name
    : access.roleKey;
  return (
    <div className="text-sm">
      <p className="truncate font-medium text-cream">
        {user ? `${user.firstName} ${user.lastName}` : ""}
      </p>
      <p className="truncate text-cream/65">{roleName}</p>
    </div>
  );
}

/** Responsive console frame: fixed sidebar from `lg`, a slide-out menu below it. Brand tokens only. */
export default function AdminShell({
  access,
  children,
}: {
  access: AdminAccess;
  children: ReactNode;
}) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [menuOpen, setMenuOpen] = useState(false);

  const signOut = async () => {
    await dispatch(logout());
    dispatch(clearAdminAccess());
    router.replace("/admin/login");
  };

  const signOutButton = (
    <Button
      onClick={signOut}
      variant="ghost"
      className="h-11 w-full justify-start px-3 text-cream/80 hover:bg-cream/10 hover:text-cream"
    >
      Sign out
    </Button>
  );

  return (
    <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="hidden bg-forest-deep px-4 py-6 lg:flex lg:flex-col lg:gap-8">
        <Link href="/admin" className="px-3 font-display text-2xl text-cream">
          Fernwood
          <span className="block text-xs font-sans uppercase tracking-[0.2em] text-cream/60">
            Admin
          </span>
        </Link>
        <NavLinks access={access} />
        <div className="mt-auto space-y-3">
          <div className="px-3">
            <Identity access={access} />
          </div>
          {signOutButton}
        </div>
      </aside>

      <div className="min-w-0">
        <header className="flex items-center justify-between bg-forest-deep px-4 py-3 text-cream lg:hidden">
          <Link href="/admin" className="font-display text-xl">
            Fernwood <span className="font-sans text-xs uppercase tracking-[0.2em]">Admin</span>
          </Link>
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 text-cream hover:bg-cream/10"
              >
                <Menu aria-hidden />
                <span className="sr-only">Open admin menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="bg-forest-deep text-cream">
              <SheetTitle className="font-display text-2xl text-cream">Fernwood Admin</SheetTitle>
              <SheetDescription className="sr-only">Admin sections</SheetDescription>
              <div className="mt-6 space-y-6">
                <NavLinks access={access} onNavigate={() => setMenuOpen(false)} />
                <div className="space-y-3 border-t border-cream/15 pt-4">
                  <div className="px-3">
                    <Identity access={access} />
                  </div>
                  {signOutButton}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
          {children}
        </main>
      </div>
    </div>
  );
}
