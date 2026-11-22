import { NextResponse } from "next/server";

import { enquiryNoteSchema } from "@/lib/enquiry-schemas";
import { requireAdmin } from "@/server/auth/guards";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { getProfile } from "@/server/services/auth";
import { addNote } from "@/server/services/enquiries";

export const dynamic = "force-dynamic";

export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "enquiries:write");
  await enforceRateLimit(`admin:enquiry-write:${admin.userId}`, 300, 3600);
  const id = request.nextUrl.pathname.split("/").slice(-2, -1)[0] ?? "";
  const { text } = await readJson(request, enquiryNoteSchema);
  const profile = await getProfile(admin.userId);
  const enquiry = await addNote(
    { id: admin.userId, name: `${profile.firstName} ${profile.lastName}` },
    id,
    text,
  );
  // The note text itself stays out of the audit log.
  await recordAudit({
    action: "enquiry.note_added",
    actorId: admin.userId,
    targetType: "enquiry",
    targetId: id,
    ip: clientIp(request),
  });
  return NextResponse.json({ data: { enquiry } }, { status: 201 });
});
