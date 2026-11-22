import { NextResponse } from "next/server";

import { addMediaSchema, removeMediaSchema, reorderMediaSchema } from "@/lib/products";
import { requireAdmin } from "@/server/auth/guards";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { addImages, removeImages, reorderImages } from "@/server/services/product-admin";
import { productGidFrom } from "@/server/shopify/admin-route";
import { revalidateCatalog } from "@/server/site/revalidate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function guarded(
  request: Parameters<typeof requireAdmin>[0],
  permission: "products:write" | "products:delete",
) {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, permission);
  await enforceRateLimit(`admin:product-write:${admin.userId}`, 240, 3600);
  return admin;
}
const done = async (
  request: Parameters<typeof requireAdmin>[0],
  userId: string,
  id: string,
  product: unknown,
) => {
  await recordAudit({
    action: "product.images_changed",
    actorId: userId,
    targetType: "product",
    targetId: id,
    ip: clientIp(request),
  });
  revalidateCatalog();
  return NextResponse.json({ data: { product } });
};

/** Add images that are already in the media library (https://cdn.shopify.com only). */
export const POST = route(async ({ request }) => {
  const admin = await guarded(request, "products:write");
  const id = productGidFrom(request);
  const { images } = await readJson(request, addMediaSchema);
  return done(request, admin.userId, id, await addImages(id, images));
});

export const PUT = route(async ({ request }) => {
  const admin = await guarded(request, "products:write");
  const id = productGidFrom(request);
  const { mediaIds } = await readJson(request, reorderMediaSchema);
  return done(request, admin.userId, id, await reorderImages(id, mediaIds));
});

export const DELETE = route(async ({ request }) => {
  const admin = await guarded(request, "products:write");
  const id = productGidFrom(request);
  const { mediaIds } = await readJson(request, removeMediaSchema);
  return done(request, admin.userId, id, await removeImages(id, mediaIds));
});
