import { NextResponse } from "next/server";

import { requireAdmin } from "@/server/auth/guards";
import { route } from "@/server/http/handler";
import { listAssignees } from "@/server/services/enquiries";

export const dynamic = "force-dynamic";

/** Team members who can be given an enquiry (enabled admins). Names only. */
export const GET = route(async ({ request }) => {
  await requireAdmin(request, "enquiries:read");
  return NextResponse.json({ data: { assignees: await listAssignees() } });
});
