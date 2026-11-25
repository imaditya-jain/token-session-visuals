import { NextResponse } from "next/server";

import { createProductSchema, productListQuerySchema } from "@/lib/products";
import { requireAdmin } from "@/server/auth/guards";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { createProduct, fetchProducts } from "@/server/services/product-admin";
import { revalidateCatalog } from "@/server/site/revalidate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = route(async ({ request }) => {
  await requireAdmin(request, "products:read");
  const query = productListQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  return NextResponse.json({ data: await fetchProducts(query) });
});

export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "products:write");
  await enforceRateLimit(`admin:product-write:${admin.userId}`, 120, 3600);
  const input = await readJson(request, createProductSchema, { maxBytes: 200_000 });
  const product = await createProduct(input);
  await recordAudit({
    action: "product.created",
    actorId: admin.userId,
    targetType: "product",
    targetId: product.id,
    meta: { variants: product.variants.length },
    ip: clientIp(request),
  });
  revalidateCatalog();
  return NextResponse.json({ data: { product } }, { status: 201 });
});
