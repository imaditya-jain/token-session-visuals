import { NextResponse } from "next/server";

import { inventorySettingsSchema } from "@/lib/products";
import { requireAdmin } from "@/server/auth/guards";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { recordAudit } from "@/server/services/audit";
import { getLowStockThreshold, setLowStockThreshold } from "@/server/services/product-admin";

export const dynamic = "force-dynamic";

export const GET = route(async ({ request }) => {
  await requireAdmin(request, "inventory:read");
  return NextResponse.json({ data: { lowStockThreshold: await getLowStockThreshold() } });
});

export const PUT = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "inventory:write");
  const { lowStockThreshold } = await readJson(request, inventorySettingsSchema);
  await setLowStockThreshold(admin.userId, lowStockThreshold);
  await recordAudit({
    action: "inventory.threshold_changed",
    actorId: admin.userId,
    targetType: "inventory",
    meta: { lowStockThreshold },
    ip: clientIp(request),
  });
  return NextResponse.json({ data: { lowStockThreshold } });
});
