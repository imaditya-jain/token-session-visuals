import type { Metadata } from "next";
import { notFound } from "next/navigation";

import CampaignEditor from "@/components/admin/campaigns/CampaignEditor";
import RequirePermission from "@/components/admin/RequirePermission";

export const metadata: Metadata = { title: "Campaign" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9]{24}$/.test(id)) notFound();
  return (
    <RequirePermission permission="campaigns:read">
      <CampaignEditor id={id} />
    </RequirePermission>
  );
}
