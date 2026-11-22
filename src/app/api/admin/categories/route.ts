import { NextResponse } from "next/server";

import { categoryInputSchema } from "@/lib/blog-schemas";
import { requireAdmin } from "@/server/auth/guards";
import { revalidateBlog } from "@/server/blog/revalidate";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { createCategory, listCategories } from "@/server/services/blog-taxonomy";

export const dynamic = "force-dynamic";

export const GET = route(async ({ request }) => {
  await requireAdmin(request, "blog:read");
  return NextResponse.json({ data: { categories: await listCategories() } });
});

export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "categories:manage");
  await enforceRateLimit(`admin:taxonomy:${admin.userId}`, 120, 3600);
  const input = await readJson(request, categoryInputSchema);
  const category = await createCategory(input);
  await recordAudit({
    action: "category.created",
    actorId: admin.userId,
    targetType: "category",
    targetId: category.id,
    ip: clientIp(request),
  });
  revalidateBlog();
  return NextResponse.json({ data: { category } }, { status: 201 });
});
