import Link from "next/link";

const tabs = [
  { href: "/account", label: "Details" },
  { href: "/account/orders", label: "Orders" },
] as const;

/** Section tabs shared by the account pages. */
export default function AccountNav({ current }: { current: (typeof tabs)[number]["href"] }) {
  return (
    <nav aria-label="Account sections" className="mb-8 flex gap-6 border-b border-border">
      {tabs.map((tab) => {
        const active = tab.href === current;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px inline-flex min-h-11 items-center border-b-2 px-1 text-sm font-semibold transition-colors ${
              active
                ? "border-clay text-forest"
                : "border-transparent text-muted-foreground hover:text-forest"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
