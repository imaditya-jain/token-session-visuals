import type { Metadata } from "next";

import PostEditor from "@/components/admin/blog/PostEditor";
import RequirePermission from "@/components/admin/RequirePermission";

export const metadata: Metadata = { title: "Edit post" };

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RequirePermission permission="blog:write">
      <PostEditor id={id} />
    </RequirePermission>
  );
}
