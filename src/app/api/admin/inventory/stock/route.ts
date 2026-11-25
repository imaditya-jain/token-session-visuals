import { NextResponse } from "next/server";
import { z } from "zod";

import { inventoryItemGid, locationGid } from "@/lib/products";
import { requireAdmin } from "@/server/auth/guards";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { stockAt } from "@/server/services/product-admin";
import { revalidateCatalog } from "@/server/site/revalidate";

export const dynamic = "force-dynamic";

const schema = z.object({
  inventoryItemId: inventoryItemGid,
  locationId: locationGid,
  available: z.number().int().min(0).max(1_000_000).default(0),
});

/** Starts stocking an item at a location where it has no stock record yet. */
export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "inventory:write");
  await enforceRateLimit(`admin:inventory-write:${admin.userId}`, 300, 3600);
  const { inventoryItemId, locationId, available } = await readJson(request, schema);
  await stockAt(inventoryItemId, locationId, available);
  await recordAudit({
    action: "inventory.activated",
    actorId: admin.userId,
    targetType: "inventory",
    targetId: inventoryItemId,
    ip: clientIp(request),
  });
  revalidateCatalog();
  return NextResponse.json({ data: { activated: true } }, { status: 201 });
});
