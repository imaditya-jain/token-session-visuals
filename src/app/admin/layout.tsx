import type { Metadata } from "next";
import type { ReactNode } from "react";

// The whole admin is private: never indexed, never cached (its data comes from authorised API calls).
export const metadata: Metadata = {
  title: { default: "Admin — Fernwood", template: "%s — Fernwood Admin" },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
