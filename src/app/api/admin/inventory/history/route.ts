import { NextResponse } from "next/server";
import { z } from "zod";

import { inventoryItemGid } from "@/lib/products";
import { requireAdmin } from "@/server/auth/guards";
import { route } from "@/server/http/handler";
import { adjustmentHistory } from "@/server/services/product-admin";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  inventoryItemId: inventoryItemGid.optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
});

/** Stock changes made through this admin (Shopify itself keeps no list of past adjustments for the API). */
export const GET = route(async ({ request }) => {
  await requireAdmin(request, "inventory:read");
  const query = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  return NextResponse.json({ data: await adjustmentHistory(query) });
});
