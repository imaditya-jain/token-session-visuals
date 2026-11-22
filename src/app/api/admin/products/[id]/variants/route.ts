import { NextResponse } from "next/server";

import { removeVariantsSchema, saveVariantsSchema } from "@/lib/products";
import { requireAdmin } from "@/server/auth/guards";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { removeVariants, saveVariants } from "@/server/services/product-admin";
import { productGidFrom } from "@/server/shopify/admin-route";
import { revalidateCatalog } from "@/server/site/revalidate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Saves a set of variants: those with an id are updated, those without are created. */
export const PUT = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "products:write");
  await enforceRateLimit(`admin:product-write:${admin.userId}`, 240, 3600);
  const id = productGidFrom(request);
  const { variants } = await readJson(request, saveVariantsSchema, { maxBytes: 200_000 });
  const product = await saveVariants(id, variants);
  await recordAudit({
    action: "product.variants_saved",
    actorId: admin.userId,
    targetType: "product",
    targetId: id,
    meta: { count: variants.length },
    ip: clientIp(request),
  });
  revalidateCatalog();
  return NextResponse.json({ data: { product } });
});

export const DELETE = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "products:delete");
  await enforceRateLimit(`admin:product-write:${admin.userId}`, 240, 3600);
  const id = productGidFrom(request);
  const { variantIds } = await readJson(request, removeVariantsSchema);
  const product = await removeVariants(id, variantIds);
  await recordAudit({
    action: "product.variants_removed",
    actorId: admin.userId,
    targetType: "product",
    targetId: id,
    meta: { count: variantIds.length },
    ip: clientIp(request),
  });
  revalidateCatalog();
  return NextResponse.json({ data: { product } });
});
