import type { Metadata } from "next";

import PostEditor from "@/components/admin/blog/PostEditor";
import RequirePermission from "@/components/admin/RequirePermission";

export const metadata: Metadata = { title: "New post" };

export default function NewPostPage() {
  return (
    <RequirePermission permission="blog:write">
      <PostEditor />
    </RequirePermission>
  );
}
