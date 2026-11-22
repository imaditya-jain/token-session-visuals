import { NextResponse } from "next/server";

import { enquiryExportQuerySchema } from "@/lib/enquiry-schemas";
import { requireAdmin } from "@/server/auth/guards";
import { clientIp, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { exportEnquiries } from "@/server/services/enquiries";

export const dynamic = "force-dynamic";

/** CSV download of the filtered enquiries. Contains personal data, so it needs its own permission and is audited. */
export const GET = route(async ({ request }) => {
  const admin = await requireAdmin(request, "enquiries:export");
  await enforceRateLimit(`admin:enquiry-export:${admin.userId}`, 20, 3600);
  const { from, to, ...filter } = enquiryExportQuerySchema.parse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  const { csv, rows } = await exportEnquiries(
    {
      ...filter,
      ...(from ? { from: new Date(`${from}T00:00:00.000Z`) } : {}),
      ...(to ? { to: new Date(`${to}T23:59:59.999Z`) } : {}),
    },
    admin.userId,
  );
  await recordAudit({
    action: "enquiry.exported",
    actorId: admin.userId,
    targetType: "enquiry",
    meta: { kind: filter.kind, rows },
    ip: clientIp(request),
  });
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="fernwood-${filter.kind}-${stamp}.csv"`,
    },
  });
});
