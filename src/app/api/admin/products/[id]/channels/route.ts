import { NextResponse } from "next/server";

import { setChannelsSchema } from "@/lib/products";
import { requireAdmin } from "@/server/auth/guards";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { setChannels } from "@/server/services/product-admin";
import { productGidFrom } from "@/server/shopify/admin-route";
import { revalidateCatalog } from "@/server/site/revalidate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Publishes the product on exactly these sales channels (and withdraws it from the others). */
export const PUT = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "products:write");
  await enforceRateLimit(`admin:product-write:${admin.userId}`, 240, 3600);
  const id = productGidFrom(request);
  const { channelIds } = await readJson(request, setChannelsSchema);
  const product = await setChannels(id, channelIds);
  await recordAudit({
    action: "product.channels_changed",
    actorId: admin.userId,
    targetType: "product",
    targetId: id,
    meta: { channels: channelIds.length },
    ip: clientIp(request),
  });
  revalidateCatalog();
  return NextResponse.json({ data: { product } });
});
