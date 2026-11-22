import { NextResponse } from "next/server";

import { requireAdmin } from "@/server/auth/guards";
import { route } from "@/server/http/handler";
import { listTags } from "@/server/services/blog-taxonomy";

export const dynamic = "force-dynamic";

export const GET = route(async ({ request }) => {
  await requireAdmin(request, "blog:read");
  return NextResponse.json({ data: { tags: await listTags() } });
});
