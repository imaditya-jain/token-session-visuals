import Link from "next/link";

const tabs = [
  { href: "/account", label: "Details" },
  { href: "/account/orders", label: "Orders" },
] as const;

/** Section tabs shared by the account pages. */
export default function AccountNav({ current }: { current: (typeof tabs)[number]["href"] }) {
  return (
    <nav
      aria-label="Account sections"
      className="mb-8 inline-flex rounded-full bg-sage-light/70 p-1.5"
    >
      {tabs.map((tab) => {
        const active = tab.href === current;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-full px-6 text-sm font-semibold transition-all duration-300 ${
              active
                ? "bg-forest text-cream shadow-md"
                : "text-forest/75 hover:bg-cream/70 hover:text-forest"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
