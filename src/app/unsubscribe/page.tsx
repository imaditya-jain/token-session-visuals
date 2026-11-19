import type { Metadata } from "next";
import { Suspense } from "react";

import AuthShell from "@/components/auth/AuthShell";
import UnsubscribePanel from "@/components/auth/UnsubscribePanel";

export const metadata: Metadata = {
  title: "Unsubscribe — Fernwood",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function UnsubscribePage() {
  return (
    <AuthShell eyebrow="Greenhouse Club" title="Unsubscribe">
      <Suspense>
        <UnsubscribePanel />
      </Suspense>
    </AuthShell>
  );
}
