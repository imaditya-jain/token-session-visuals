import type { Metadata } from "next";

import ActivityList from "@/components/admin/ActivityList";
import PageHeader from "@/components/admin/PageHeader";
import RequirePermission from "@/components/admin/RequirePermission";

export const metadata: Metadata = { title: "Activity" };

export default function ActivityPage() {
  return (
    <RequirePermission permission="audit:read">
      <PageHeader title="Activity" lead="Sensitive actions and sign-in attempts, newest first." />
      <ActivityList pageSize={25} paged />
    </RequirePermission>
  );
}
