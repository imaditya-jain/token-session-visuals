import "server-only";

import type { NextRequest } from "next/server";

import { numericId, toGid } from "@/lib/products";
import { notFound } from "@/server/http/errors";

/** The `[id]` segment of `/api/admin/products/[id]/…`, turned into a Shopify global id (404 if it isn't numeric). */
export function productGidFrom(request: NextRequest): string {
  const parts = request.nextUrl.pathname.split("/");
  const at = parts.indexOf("products");
  const id = numericId.safeParse(parts[at + 1] ?? "");
  if (!id.success) throw notFound("Product not found", "product_not_found");
  return toGid("Product", id.data);
}
