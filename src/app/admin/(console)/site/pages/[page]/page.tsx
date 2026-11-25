import type { Metadata } from "next";
import { notFound } from "next/navigation";

import RequirePermission from "@/components/admin/RequirePermission";
import PageContentEditor from "@/components/admin/pages/PageContentEditor";
import { isPageId } from "@/lib/page-content";

export const metadata: Metadata = { title: "Edit page content" };

export default async function Page({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params;
  if (!isPageId(page)) notFound();
  return (
    <RequirePermission permission="site:write">
      <PageContentEditor pageId={page} />
    </RequirePermission>
  );
}
