import type { ReactNode } from "react";

import { ChromeProvider } from "@/components/admin/site/ChromeEditor";

/** The three Website pages share one draft, so edits survive moving between them. */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return <ChromeProvider>{children}</ChromeProvider>;
}
