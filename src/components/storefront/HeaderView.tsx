"use client";

import { Fragment, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, Search, ShoppingBag, User, X, ChevronDown } from "lucide-react";

import type { NavItem, SiteChrome } from "@/lib/site-chrome";
import Logo from "@/components/storefront/Logo";
import MiniCart from "@/components/storefront/MiniCart";
import { setCartOpen } from "@/features/cart/cartSlice";
import { setSearchOpen } from "@/features/ui/uiSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const isRouteLink = (href: string) => href.startsWith("/");

type HeaderContent = {
  announcement: SiteChrome["announcement"];
  nav: NavItem[];
  helpEmail: string;
};

function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [term, setTerm] = useState("");
  if (!open) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = term.trim();
    if (!trimmed) return;
    onClose();
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  return (
    <div className="fixed inset-x-0 top-0 z-50 animate-rise bg-forest-deep/95 text-cream backdrop-blur-sm">
      <form
        role="search"
        onSubmit={submit}
        className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-5 sm:px-6 lg:px-8"
      >
        <Search className="size-5 shrink-0 text-sage" aria-hidden />
        <input
          autoFocus
          type="search"
          name="q"
          value={term}
          maxLength={100}
          autoComplete="off"
          enterKeyHint="search"
          aria-label="Search"
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search plants, pots, tools…"
          className="w-full bg-transparent font-display text-lg outline-none placeholder:text-sage sm:text-2xl"
          onKeyDown={(e) => e.key === "Escape" && onClose()}
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close search"
          className="rounded-full p-2 transition-colors hover:bg-cream/10"
        >
          <X className="size-5" />
        </button>
      </form>
    </div>
  );
}

const mobileLinkClass =
  "flex items-center justify-between border-b border-cream/10 py-4 font-display text-xl text-cream transition-colors hover:text-sage";

function MobileLink({
  href,
  onNavigate,
  nested = false,
  children,
}: {
  href: string;
  onNavigate: () => void;
  nested?: boolean;
  children: ReactNode;
}) {
  const className = nested
    ? `${mobileLinkClass} pl-5 !text-lg !font-sans text-cream/85`
    : mobileLinkClass;
  const content = (
    <>
      {children}
      <ChevronDown className="size-4 -rotate-90 text-sage" />
    </>
  );
  return isRouteLink(href) ? (
    <Link href={href} onClick={onNavigate} className={className}>
      {content}
    </Link>
  ) : (
    <a href={href} onClick={onNavigate} className={className}>
      {content}
    </a>
  );
}

const desktopLinkClass = "group relative text-foreground/90 transition-colors hover:text-forest";
const underline = (
  <span className="absolute -bottom-1 left-0 h-px w-0 bg-clay transition-all duration-300 group-hover:w-full" />
);

function DesktopLink({ href, children }: { href: string; children: ReactNode }) {
  return isRouteLink(href) ? (
    <Link href={href} className={desktopLinkClass}>
      {children}
      {underline}
    </Link>
  ) : (
    <a href={href} className={desktopLinkClass}>
      {children}
      {underline}
    </a>
  );
}

/** A menu item with a dropdown. Opens on hover or keyboard focus, with no script: links stay reachable by Tab. */
function DesktopDropdown({ item }: { item: NavItem }) {
  return (
    <div className="group/menu relative">
      <DesktopLink href={item.href}>
        <span className="inline-flex items-center gap-1">
          {item.label}
          <ChevronDown className="size-3.5 text-clay" aria-hidden />
        </span>
      </DesktopLink>
      <ul className="invisible absolute left-1/2 top-full z-40 mt-3 w-56 -translate-x-1/2 rounded-xl bg-card p-2 opacity-0 shadow-lg ring-1 ring-border/60 transition-opacity group-focus-within/menu:visible group-focus-within/menu:opacity-100 group-hover/menu:visible group-hover/menu:opacity-100">
        {item.children.map((child) => (
          <li key={child.label}>
            {isRouteLink(child.href) ? (
              <Link
                href={child.href}
                className="block rounded-md px-3 py-2.5 text-sm text-foreground hover:bg-muted hover:text-forest"
              >
                {child.label}
              </Link>
            ) : (
              <a
                href={child.href}
                className="block rounded-md px-3 py-2.5 text-sm text-foreground hover:bg-muted hover:text-forest"
              >
                {child.label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The storefront header. Its content (announcement, menu, help address) comes from the admin via `Header`. */
export default function HeaderView({ announcement, nav: navLinks, helpEmail }: HeaderContent) {
  const dispatch = useAppDispatch();
  const searchOpen = useAppSelector((state) => state.ui.searchOpen);
  const signedIn = useAppSelector((state) => state.auth.status === "authenticated");
  const cartCount = useAppSelector((state) => state.cart.cart?.totalQuantity ?? 0);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      {/* Announcement bar */}
      {announcement.enabled && announcement.items.length > 0 ? (
        <div role="region" aria-label="Announcement" className="bg-forest-deep text-cream">
          <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-2 text-center text-xs tracking-wide sm:text-sm">
            {announcement.items.map((item, index) => (
              <Fragment key={`${index}-${item.text}`}>
                {index > 0 ? <span className="hidden sm:inline text-sage">•</span> : null}
                <span className={item.hideOnMobile ? "hidden sm:inline" : undefined}>
                  {item.text}
                  {item.highlight ? (
                    <>
                      {" "}
                      <span className="text-sage">{item.highlight}</span>
                    </>
                  ) : null}
                </span>
              </Fragment>
            ))}
          </div>
        </div>
      ) : null}

      <header className="relative z-30">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
          {/* Mobile menu */}
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger
              aria-label="Open menu"
              className="rounded-full p-2 text-foreground transition-colors hover:bg-sand lg:hidden"
            >
              <Menu className="size-5" />
            </SheetTrigger>
            <SheetContent side="left" className="border-border bg-forest text-cream p-0 w-80">
              <SheetHeader className="border-b border-cream/15 px-6 py-5">
                <SheetTitle className="font-display text-2xl text-cream">Fernwood</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col px-6 py-6">
                {navLinks.map((link) => (
                  <Fragment key={link.label}>
                    <MobileLink href={link.href} onNavigate={() => setMenuOpen(false)}>
                      {link.label}
                    </MobileLink>
                    {link.children.map((child) => (
                      <MobileLink
                        key={`${link.label}-${child.label}`}
                        href={child.href}
                        onNavigate={() => setMenuOpen(false)}
                        nested
                      >
                        {child.label}
                      </MobileLink>
                    ))}
                  </Fragment>
                ))}
                <Link
                  href={signedIn ? "/account" : "/login"}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center justify-between border-b border-cream/10 py-4 font-display text-xl text-cream transition-colors hover:text-sage"
                >
                  {signedIn ? "My account" : "Sign in"}
                  <ChevronDown className="size-4 -rotate-90 text-sage" />
                </Link>
              </nav>
              <div className="mt-auto px-6 pb-8 text-sm text-sage">
                <p className="font-medium text-cream">Need help choosing?</p>
                {helpEmail ? (
                  <a
                    href={`mailto:${helpEmail}`}
                    className="block transition-colors hover:text-cream"
                  >
                    {helpEmail}
                  </a>
                ) : null}
              </div>
            </SheetContent>
          </Sheet>

          {/* Logo */}
          <Link
            href="/"
            className="font-display text-3xl font-medium tracking-tight text-forest lg:text-4xl"
          >
            <Logo />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-8 text-sm font-medium lg:flex">
            {navLinks.map((link) =>
              link.children.length > 0 ? (
                <DesktopDropdown key={link.label} item={link} />
              ) : (
                <DesktopLink key={link.label} href={link.href}>
                  {link.label}
                </DesktopLink>
              ),
            )}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => dispatch(setSearchOpen(true))}
              aria-label="Search"
              className="rounded-full p-2 text-foreground transition-colors hover:bg-sand"
            >
              <Search className="size-5" />
            </button>
            <Link
              href={signedIn ? "/account" : "/login"}
              aria-label="Account"
              className="hidden rounded-full p-2 text-foreground transition-colors hover:bg-sand sm:block"
            >
              <User className="size-5" />
            </Link>
            <button
              onClick={() => dispatch(setCartOpen(true))}
              aria-label={`Cart, ${cartCount} ${cartCount === 1 ? "item" : "items"}`}
              className="relative rounded-full p-2 text-foreground transition-colors hover:bg-sand"
            >
              <ShoppingBag className="size-5" />
              {cartCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex size-4.5 items-center justify-center rounded-full bg-clay text-[10px] font-semibold text-cream">
                  {cartCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>
      </header>

      <MiniCart />
      <SearchOverlay open={searchOpen} onClose={() => dispatch(setSearchOpen(false))} />
    </>
  );
}
