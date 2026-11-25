import "server-only";

import type { NextRequest } from "next/server";

import { toGid } from "@/lib/products";
import { notFound } from "@/server/http/errors";

/** The `[id]` segment of `/api/admin/orders/[id]/…` as a Shopify global id (404 unless numeric). */
export function orderGidFrom(request: NextRequest): string {
  const parts = request.nextUrl.pathname.split("/");
  const id = parts[parts.indexOf("orders") + 1] ?? "";
  if (!/^\d{1,20}$/.test(id)) throw notFound("Order not found", "order_not_found");
  return toGid("Order", id);
}
