import "server-only";

import type { AdminContext } from "@/server/auth/guards";
import type { BlogActor } from "@/server/services/blog-admin";

/** What this admin may do with posts, derived from their role on the server. */
export const blogActor = (admin: AdminContext): BlogActor => ({
  userId: admin.userId,
  canPublish: admin.permissions.has("blog:publish"),
  canDelete: admin.permissions.has("blog:delete"),
});

/** Request body cap for posts (the editor sends the whole document; Vercel itself stops at 4.5 MB). */
export const POST_BODY_BYTES = 1_000_000;
