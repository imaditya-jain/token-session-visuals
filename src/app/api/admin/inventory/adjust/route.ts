import { NextResponse } from "next/server";

import { adjustInventorySchema } from "@/lib/products";
import { requireAdmin } from "@/server/auth/guards";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { getProfile } from "@/server/services/auth";
import { adjustStock } from "@/server/services/product-admin";
import { revalidateCatalog } from "@/server/site/revalidate";

export const dynamic = "force-dynamic";

export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "inventory:write");
  await enforceRateLimit(`admin:inventory-write:${admin.userId}`, 300, 3600);
  const input = await readJson(request, adjustInventorySchema);
  const profile = await getProfile(admin.userId);
  const result = await adjustStock(
    { id: admin.userId, name: `${profile.firstName} ${profile.lastName}` },
    input,
  );
  await recordAudit({
    action: "inventory.adjusted",
    actorId: admin.userId,
    targetType: "inventory",
    targetId: input.inventoryItemId,
    meta: { delta: input.delta, reason: input.reason },
    ip: clientIp(request),
  });
  revalidateCatalog();
  return NextResponse.json({ data: result });
});
