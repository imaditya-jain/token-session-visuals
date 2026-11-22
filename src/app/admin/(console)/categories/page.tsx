import type { Metadata } from "next";

import TaxonomyPanel from "@/components/admin/blog/TaxonomyPanel";
import RequirePermission from "@/components/admin/RequirePermission";

export const metadata: Metadata = { title: "Categories & tags" };

export default function CategoriesPage() {
  return (
    <RequirePermission permission="categories:manage">
      <TaxonomyPanel />
    </RequirePermission>
  );
}
