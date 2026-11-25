import "server-only";

import { z } from "zod";

import { toCsv } from "@/lib/csv";
import type {
  OrderDetail,
  OrderListPage,
  OrderListQuery,
  cancelOrderSchema,
  fulfillOrderSchema,
  refundOrderSchema,
} from "@/lib/orders-admin";
import { badRequest, notFound } from "@/server/http/errors";
import * as shopify from "@/server/shopify/order-admin";

import { viaShopify } from "./product-admin";

export const fetchOrders = (query: Partial<OrderListQuery>): Promise<OrderListPage> =>
  viaShopify(() => shopify.listOrders(query));

export async function readOrder(id: string): Promise<OrderDetail> {
  const order = await viaShopify(() => shopify.getOrder(id));
  if (!order) throw notFound("Order not found", "order_not_found");
  return order;
}

const reload = async (id: string): Promise<OrderDetail> => {
  const order = await shopify.getOrder(id);
  if (!order) throw notFound("Order not found", "order_not_found");
  return order;
};

export async function fulfillOrder(
  id: string,
  input: z.infer<typeof fulfillOrderSchema>,
): Promise<OrderDetail> {
  return viaShopify(async () => {
    const before = await reload(id);
    if (!before.fulfillmentOrders.some((f) => f.id === input.fulfillmentOrderId))
      throw badRequest("That shipment doesn't belong to this order.", "fulfillment_mismatch");
    if (before.cancelledAt)
      throw badRequest("A cancelled order can't be fulfilled.", "order_cancelled");
    await shopify.createFulfillment(input);
    return reload(id);
  });
}

export async function cancelOrder(
  id: string,
  input: z.infer<typeof cancelOrderSchema>,
): Promise<OrderDetail> {
  return viaShopify(async () => {
    const before = await reload(id);
    if (before.cancelledAt) throw badRequest("This order is already cancelled.", "order_cancelled");
    await shopify.cancelOrder(id, input);
    return reload(id);
  });
}

export async function refundOrder(
  id: string,
  input: z.infer<typeof refundOrderSchema>,
): Promise<{ order: OrderDetail; refunded: string }> {
  return viaShopify(async () => {
    const before = await reload(id);
    for (const line of input.lines) {
      const found = before.lines.find((l) => l.id === line.lineItemId);
      if (!found) throw badRequest("An item doesn't belong to this order.", "line_mismatch");
      if (line.quantity > found.refundableQuantity)
        throw badRequest(
          `Only ${found.refundableQuantity} of "${found.title}" can still be refunded.`,
          "refund_quantity",
        );
    }
    const amount = await shopify.refundOrder(id, input);
    return { order: await reload(id), refunded: `${amount.amount} ${amount.currency}` };
  });
}

export async function updateOrder(
  id: string,
  patch: { note?: string | undefined; tags?: string[] | undefined },
): Promise<OrderDetail> {
  return viaShopify(async () => {
    await reload(id);
    await shopify.updateOrder(id, patch);
    return reload(id);
  });
}

const EXPORT_LIMIT = 5000;
const PAGE = 100;

/** Spreadsheet of the filtered orders (no addresses or emails: those stay in Shopify). */
export async function exportOrders(
  query: Partial<OrderListQuery>,
): Promise<{ csv: string; rows: number; truncated: boolean }> {
  const items: OrderListPage["items"] = [];
  let after: string | undefined = undefined;
  let truncated = false;
  await viaShopify(async () => {
    while (items.length < EXPORT_LIMIT) {
      const page: OrderListPage = await shopify.listOrders({ ...query, after }, PAGE);
      items.push(...page.items);
      if (!page.nextCursor) return;
      after = page.nextCursor;
    }
    truncated = true;
  });
  const rows = items.slice(0, EXPORT_LIMIT);
  return {
    rows: rows.length,
    truncated,
    csv: toCsv(
      [
        "Order",
        "Date",
        "Customer",
        "Payment",
        "Fulfilment",
        "Cancelled",
        "Items",
        "Total",
        "Currency",
        "Tags",
      ],
      rows.map((o) => [
        o.name,
        o.createdAt,
        o.customerName,
        o.payment,
        o.fulfillment,
        o.cancelled ? "yes" : "no",
        o.itemCount,
        o.total.amount,
        o.total.currency,
        o.tags.join("; "),
      ]),
    ),
  };
}
