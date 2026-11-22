import { NextResponse } from "next/server";

import { postInputSchema, postListQuerySchema } from "@/lib/blog-schemas";
import { requireAdmin } from "@/server/auth/guards";
import { blogActor, POST_BODY_BYTES } from "@/server/blog/actor";
import { revalidateBlog } from "@/server/blog/revalidate";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { createPost, listPosts } from "@/server/services/blog-admin";

export const dynamic = "force-dynamic";

export const GET = route(async ({ request }) => {
  await requireAdmin(request, "blog:read");
  const query = postListQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  return NextResponse.json({ data: await listPosts(query) });
});

export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "blog:write");
  await enforceRateLimit(`admin:post-write:${admin.userId}`, 240, 3600);
  const input = await readJson(request, postInputSchema, { maxBytes: POST_BODY_BYTES });
  const post = await createPost(blogActor(admin), input);
  await recordAudit({
    action: "post.created",
    actorId: admin.userId,
    targetType: "post",
    targetId: post.id,
    meta: { status: post.status },
    ip: clientIp(request),
  });
  if (post.status !== "draft") revalidateBlog();
  return NextResponse.json({ data: { post } }, { status: 201 });
});
