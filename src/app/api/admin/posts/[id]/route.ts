import { NextResponse } from "next/server";

import { postInputSchema } from "@/lib/blog-schemas";
import { requireAdmin } from "@/server/auth/guards";
import { blogActor, POST_BODY_BYTES } from "@/server/blog/actor";
import { revalidateBlog } from "@/server/blog/revalidate";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { getPostDetail, updatePost } from "@/server/services/blog-admin";

export const dynamic = "force-dynamic";

const idOf = (pathname: string) => pathname.split("/").pop() ?? "";

export const GET = route(async ({ request }) => {
  await requireAdmin(request, "blog:read");
  return NextResponse.json({ data: { post: await getPostDetail(idOf(request.nextUrl.pathname)) } });
});

export const PUT = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "blog:write");
  await enforceRateLimit(`admin:post-write:${admin.userId}`, 240, 3600);
  const id = idOf(request.nextUrl.pathname);
  const input = await readJson(request, postInputSchema, { maxBytes: POST_BODY_BYTES });
  const before = await getPostDetail(id);
  const post = await updatePost(blogActor(admin), id, input);
  await recordAudit({
    action: before.status === post.status ? "post.updated" : "post.status_changed",
    actorId: admin.userId,
    targetType: "post",
    targetId: id,
    meta: { from: before.status, to: post.status },
    ip: clientIp(request),
  });
  // Anything that was or is live changes public pages; a draft edit doesn't.
  if (before.status !== "draft" || post.status !== "draft") revalidateBlog();
  return NextResponse.json({ data: { post } });
});
