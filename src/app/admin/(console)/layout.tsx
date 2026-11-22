import type { ReactNode } from "react";

import AdminGate from "@/components/admin/AdminGate";

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return <AdminGate>{children}</AdminGate>;
}
