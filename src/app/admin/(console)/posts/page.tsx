import type { Metadata } from "next";

import PostsPanel from "@/components/admin/blog/PostsPanel";
import RequirePermission from "@/components/admin/RequirePermission";

export const metadata: Metadata = { title: "Posts" };

export default function PostsPage() {
  return (
    <RequirePermission permission="blog:read">
      <PostsPanel />
    </RequirePermission>
  );
}
