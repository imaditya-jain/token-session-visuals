import { NextResponse } from "next/server";

import { enquiryPatchSchema } from "@/lib/enquiry-schemas";
import { requireAdmin } from "@/server/auth/guards";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { deleteEnquiry, getEnquiry, updateEnquiry } from "@/server/services/enquiries";

export const dynamic = "force-dynamic";

const idOf = (pathname: string) => pathname.split("/").pop() ?? "";

export const GET = route(async ({ request }) => {
  await requireAdmin(request, "enquiries:read");
  return NextResponse.json({ data: { enquiry: await getEnquiry(idOf(request.nextUrl.pathname)) } });
});

export const PATCH = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "enquiries:write");
  await enforceRateLimit(`admin:enquiry-write:${admin.userId}`, 300, 3600);
  const id = idOf(request.nextUrl.pathname);
  const patch = await readJson(request, enquiryPatchSchema);
  const enquiry = await updateEnquiry(admin.userId, id, patch);
  await recordAudit({
    action: "enquiry.updated",
    actorId: admin.userId,
    targetType: "enquiry",
    targetId: id,
    meta: {
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.assignedTo !== undefined ? { assigned: patch.assignedTo !== null } : {}),
      ...(patch.archived !== undefined ? { archived: patch.archived } : {}),
    },
    ip: clientIp(request),
  });
  return NextResponse.json({ data: { enquiry } });
});

export const DELETE = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "enquiries:delete");
  await enforceRateLimit(`admin:enquiry-write:${admin.userId}`, 300, 3600);
  const id = idOf(request.nextUrl.pathname);
  await deleteEnquiry(id);
  await recordAudit({
    action: "enquiry.deleted",
    actorId: admin.userId,
    targetType: "enquiry",
    targetId: id,
    ip: clientIp(request),
  });
  return NextResponse.json({ data: { deleted: true } });
});
