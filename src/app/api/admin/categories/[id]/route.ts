import { NextResponse } from "next/server";

import { categoryPatchSchema } from "@/lib/blog-schemas";
import { requireAdmin } from "@/server/auth/guards";
import { revalidateBlog } from "@/server/blog/revalidate";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { deleteCategory, updateCategory } from "@/server/services/blog-taxonomy";

export const dynamic = "force-dynamic";

const idOf = (pathname: string) => pathname.split("/").pop() ?? "";

export const PATCH = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "categories:manage");
  await enforceRateLimit(`admin:taxonomy:${admin.userId}`, 120, 3600);
  const id = idOf(request.nextUrl.pathname);
  await updateCategory(id, await readJson(request, categoryPatchSchema));
  await recordAudit({
    action: "category.updated",
    actorId: admin.userId,
    targetType: "category",
    targetId: id,
    ip: clientIp(request),
  });
  revalidateBlog();
  return NextResponse.json({ data: { updated: true } });
});

export const DELETE = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "categories:manage");
  await enforceRateLimit(`admin:taxonomy:${admin.userId}`, 120, 3600);
  const id = idOf(request.nextUrl.pathname);
  await deleteCategory(id);
  await recordAudit({
    action: "category.deleted",
    actorId: admin.userId,
    targetType: "category",
    targetId: id,
    ip: clientIp(request),
  });
  revalidateBlog();
  return NextResponse.json({ data: { deleted: true } });
});
