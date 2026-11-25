import { NextResponse } from "next/server";

import { addOptionSchema, deleteOptionSchema, updateOptionSchema } from "@/lib/products";
import { requireAdmin } from "@/server/auth/guards";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { addOption, deleteOption, updateOption } from "@/server/services/product-admin";
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
    action: "product.options_changed",
    actorId: userId,
    targetType: "product",
    targetId: id,
    ip: clientIp(request),
  });
  revalidateCatalog();
  return NextResponse.json({ data: { product } });
};

export const POST = route(async ({ request }) => {
  const admin = await guarded(request, "products:write");
  const id = productGidFrom(request);
  const { option } = await readJson(request, addOptionSchema);
  return done(request, admin.userId, id, await addOption(id, option));
});

export const PATCH = route(async ({ request }) => {
  const admin = await guarded(request, "products:write");
  const id = productGidFrom(request);
  const { optionId, name, addValues } = await readJson(request, updateOptionSchema);
  return done(request, admin.userId, id, await updateOption(id, { id: optionId, name, addValues }));
});

export const DELETE = route(async ({ request }) => {
  const admin = await guarded(request, "products:delete");
  const id = productGidFrom(request);
  const { optionId } = await readJson(request, deleteOptionSchema);
  return done(request, admin.userId, id, await deleteOption(id, optionId));
});
