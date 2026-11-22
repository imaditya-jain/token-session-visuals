import { NextResponse } from "next/server";

import { auditQuerySchema } from "@/lib/admin-schemas";
import { requireAdmin } from "@/server/auth/guards";
import { route } from "@/server/http/handler";
import { listAudit } from "@/server/services/audit";

export const dynamic = "force-dynamic";

export const GET = route(async ({ request }) => {
  await requireAdmin(request, "audit:read");
  const { limit, before } = auditQuerySchema.parse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  return NextResponse.json({
    data: await listAudit({ limit, ...(before ? { before: new Date(before) } : {}) }),
  });
});
