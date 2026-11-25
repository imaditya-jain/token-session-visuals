import Link from "next/link";

import { getPageContent } from "@/server/services/page-content-public";

export default async function NotFound() {
  const c = await getPageContent("not-found");
  const button = c.link("message", "button");
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">{c.text("message", "code")}</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">{c.text("message", "title")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{c.text("message", "text")}</p>
        <div className="mt-6">
          <Link
            href={button.href}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {button.label}
          </Link>
        </div>
      </div>
    </main>
  );
}
