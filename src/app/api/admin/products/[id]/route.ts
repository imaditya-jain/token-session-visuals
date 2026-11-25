import { NextResponse } from "next/server";

import { updateProductSchema } from "@/lib/products";
import { requireAdmin } from "@/server/auth/guards";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { deleteProduct, readProduct, updateProduct } from "@/server/services/product-admin";
import { productGidFrom } from "@/server/shopify/admin-route";
import { revalidateCatalog } from "@/server/site/revalidate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = route(async ({ request }) => {
  await requireAdmin(request, "products:read");
  return NextResponse.json({ data: { product: await readProduct(productGidFrom(request)) } });
});

export const PATCH = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "products:write");
  await enforceRateLimit(`admin:product-write:${admin.userId}`, 240, 3600);
  const id = productGidFrom(request);
  const { product: patch } = await readJson(request, updateProductSchema, { maxBytes: 200_000 });
  // Archiving hides a product from the shop, so it needs the stronger permission, like deleting.
  if (patch.status === "ARCHIVED") await requireAdmin(request, "products:delete");
  const product = await updateProduct(id, patch);
  await recordAudit({
    action: patch.status === "ARCHIVED" ? "product.archived" : "product.updated",
    actorId: admin.userId,
    targetType: "product",
    targetId: id,
    meta: { fields: Object.keys(patch).join(",").slice(0, 200) },
    ip: clientIp(request),
  });
  revalidateCatalog();
  return NextResponse.json({ data: { product } });
});

/** Permanent. Shopify can't undo it; archiving (a status change) is the reversible alternative. */
export const DELETE = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "products:delete");
  await enforceRateLimit(`admin:product-write:${admin.userId}`, 240, 3600);
  const id = productGidFrom(request);
  await deleteProduct(id);
  await recordAudit({
    action: "product.deleted",
    actorId: admin.userId,
    targetType: "product",
    targetId: id,
    ip: clientIp(request),
  });
  revalidateCatalog();
  return NextResponse.json({ data: { deleted: true } });
});
