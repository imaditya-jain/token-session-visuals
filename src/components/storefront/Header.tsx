import { useState } from "react";
import { Menu, Search, ShoppingBag, User, X, ChevronDown } from "lucide-react";

import { navLinks } from "@/data/catalog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-50 animate-rise bg-forest-deep/95 text-cream backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-5 sm:px-6 lg:px-8">
        <Search className="size-5 shrink-0 text-sage" aria-hidden />
        <input
          autoFocus
          type="search"
          placeholder="Search plants, pots, tools…"
          className="w-full bg-transparent font-display text-lg outline-none placeholder:text-sage sm:text-2xl"
          onKeyDown={(e) => e.key === "Escape" && onClose()}
        />
        <button
          onClick={onClose}
          aria-label="Close search"
          className="rounded-full p-2 transition-colors hover:bg-cream/10"
        >
          <X className="size-5" />
        </button>
      </div>
    </div>
  );
}

export default function Header() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      {/* Announcement bar */}
      <div className="bg-forest-deep text-cream">
        <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-2 text-center text-xs tracking-wide sm:text-sm">
          <span className="hidden sm:inline">Free shipping on orders over $75</span>
          <span className="hidden sm:inline text-sage">•</span>
          <span>
            Spring Greenhouse Event — <span className="text-sage">up to 30% off</span>
          </span>
        </div>
      </div>

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
                  <a
                    key={link.label}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center justify-between border-b border-cream/10 py-4 font-display text-xl text-cream transition-colors hover:text-sage"
                  >
                    {link.label}
                    <ChevronDown className="size-4 -rotate-90 text-sage" />
                  </a>
                ))}
              </nav>
              <div className="mt-auto px-6 pb-8 text-sm text-sage">
                <p className="font-medium text-cream">Need help choosing?</p>
                <p>hello@fernwood.shop</p>
              </div>
            </SheetContent>
          </Sheet>

          {/* Logo */}
          <a
            href="/"
            className="font-display text-3xl font-medium tracking-tight text-forest lg:text-4xl"
          >
            Fernwood
          </a>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-8 text-sm font-medium lg:flex">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="group relative text-foreground/90 transition-colors hover:text-forest"
              >
                {link.label}
                <span className="absolute -bottom-1 left-0 h-px w-0 bg-clay transition-all duration-300 group-hover:w-full" />
              </a>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => setSearchOpen(true)}
              aria-label="Search"
              className="rounded-full p-2 text-foreground transition-colors hover:bg-sand"
            >
              <Search className="size-5" />
            </button>
            <button
              aria-label="Account"
              className="hidden rounded-full p-2 text-foreground transition-colors hover:bg-sand sm:block"
            >
              <User className="size-5" />
            </button>
            <button
              aria-label="Cart, 2 items"
              className="relative rounded-full p-2 text-foreground transition-colors hover:bg-sand"
            >
              <ShoppingBag className="size-5" />
              <span className="absolute -right-0.5 -top-0.5 flex size-4.5 items-center justify-center rounded-full bg-clay text-[10px] font-semibold text-cream">
                2
              </span>
            </button>
          </div>
        </div>
      </header>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
