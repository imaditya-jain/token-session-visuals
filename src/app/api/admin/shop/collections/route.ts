import { NextResponse } from "next/server";

import { requireAdmin } from "@/server/auth/guards";
import { route } from "@/server/http/handler";
import { listCollections } from "@/server/services/product-admin";

export const dynamic = "force-dynamic";

export const GET = route(async ({ request }) => {
  await requireAdmin(request, "products:read");
  return NextResponse.json({ data: { collections: await listCollections() } });
});
