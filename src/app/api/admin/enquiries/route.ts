import { NextResponse } from "next/server";

import { enquiryQuerySchema } from "@/lib/enquiry-schemas";
import { requireAdmin } from "@/server/auth/guards";
import { route } from "@/server/http/handler";
import { listEnquiries } from "@/server/services/enquiries";

export const dynamic = "force-dynamic";

export const GET = route(async ({ request }) => {
  const admin = await requireAdmin(request, "enquiries:read");
  const { page, perPage, ...filter } = enquiryQuerySchema.parse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  return NextResponse.json({ data: await listEnquiries(filter, page, perPage, admin.userId) });
});
