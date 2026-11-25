import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/server/auth/guards";
import { route } from "@/server/http/handler";
import { lowStock } from "@/server/services/product-admin";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  soldOut: z.enum(["1", "true", "0", "false"]).optional(),
  after: z.string().max(500).optional(),
});

/** Variants at or below the low-stock threshold, or only the sold-out ones (`soldOut=1`). Live from Shopify. */
export const GET = route(async ({ request }) => {
  await requireAdmin(request, "inventory:read");
  const query = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  return NextResponse.json({
    data: await lowStock({
      soldOutOnly: query.soldOut === "1" || query.soldOut === "true",
      after: query.after,
    }),
  });
});
