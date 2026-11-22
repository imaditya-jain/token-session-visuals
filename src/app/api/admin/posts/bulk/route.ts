import { NextResponse } from "next/server";

import { bulkSchema } from "@/lib/blog-schemas";
import { requireAdmin } from "@/server/auth/guards";
import { blogActor } from "@/server/blog/actor";
import { revalidateBlog } from "@/server/blog/revalidate";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { bulkAction } from "@/server/services/blog-admin";

export const dynamic = "force-dynamic";

export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  // Which permission an action needs is decided by the service; this only requires some blog access.
  const admin = await requireAdmin(request, "blog:read");
  await enforceRateLimit(`admin:post-bulk:${admin.userId}`, 60, 3600);
  const { ids, action } = await readJson(request, bulkSchema, { maxBytes: 20_000 });
  const changed = await bulkAction(blogActor(admin), ids, action);
  await recordAudit({
    action: `post.bulk_${action}`,
    actorId: admin.userId,
    targetType: "post",
    meta: { requested: ids.length, changed },
    ip: clientIp(request),
  });
  if (changed > 0) revalidateBlog();
  return NextResponse.json({ data: { changed } });
});
