import "server-only";

import type { Money, OrderDetail, OrderPage, OrderSummary } from "@/lib/orders";
import { ORDERS_PAGE_SIZE } from "@/lib/orders";
import { connectDb } from "@/server/db/connection";
import { User } from "@/server/db/models/user";
import { AppError, forbidden, unauthorized } from "@/server/http/errors";
import { logger } from "@/server/logger";
import { adminQuery } from "@/server/shopify/admin";
import { ShopifyError } from "@/server/shopify/client";
import { ORDER_QUERY, ORDERS_QUERY } from "@/server/shopify/orders-queries";
import { type OrderNode, orderResponse, ordersResponse } from "@/server/shopify/orders-schemas";

type Owner = { email: string };

const ORDER_ID = /^\d{1,20}$/;
const gidFor = (id: string) => `gid://shopify/Order/${id}`;
const numericId = (gid: string) => gid.slice(gid.lastIndexOf("/") + 1);
const money = (set: { shopMoney: { amount: string; currencyCode: string } }): Money => ({
  amount: set.shopMoney.amount,
  currency: set.shopMoney.currencyCode,
});

/** Only accounts that proved control of their mailbox may read orders placed under that email. */
async function loadOwner(userId: string): Promise<Owner> {
  await connectDb();
  const user = await User.findById(userId).select("email emailVerifiedAt").lean();
  if (!user) throw unauthorized("Account not found", "session_revoked");
  if (!user.emailVerifiedAt) {
    throw forbidden("Confirm your email address to see your orders.", "email_unverified");
  }
  return { email: user.email.toLowerCase() };
}

const belongsTo = (owner: Owner, node: OrderNode) => node.email?.toLowerCase() === owner.email;

function summarize(node: OrderNode): OrderSummary {
  const images = node.lineItems.nodes.flatMap((line) => (line.image ? [line.image.url] : []));
  return {
    id: numericId(node.id),
    name: node.name,
    processedAt: node.processedAt ?? node.createdAt,
    financialStatus: node.displayFinancialStatus ?? "PENDING",
    fulfillmentStatus: node.displayFulfillmentStatus,
    cancelled: node.cancelledAt !== null,
    total: money(node.currentTotalPriceSet),
    itemCount: node.lineItems.nodes.reduce((sum, line) => sum + line.quantity, 0),
    previewImages: images.slice(0, 3),
  };
}

function detail(node: OrderNode): OrderDetail {
  const address = node.shippingAddress;
  return {
    ...summarize(node),
    lines: node.lineItems.nodes.map((line) => ({
      title: line.title,
      ...(line.variantTitle ? { variantTitle: line.variantTitle } : {}),
      quantity: line.quantity,
      ...(line.image ? { image: line.image.url } : {}),
      unitPrice: money(line.originalUnitPriceSet),
    })),
    subtotal: money(node.currentSubtotalPriceSet),
    shipping: money(node.totalShippingPriceSet),
    tax: money(node.currentTotalTaxSet),
    tracking: node.fulfillments.flatMap((fulfillment) =>
      fulfillment.trackingInfo.map((info) => ({
        ...(info.company ? { company: info.company } : {}),
        ...(info.number ? { number: info.number } : {}),
        ...(info.url ? { url: info.url } : {}),
      })),
    ),
    ...(address
      ? {
          shippingAddress: {
            ...(address.city ? { city: address.city } : {}),
            ...(address.province ? { region: address.province } : {}),
            ...(address.country ? { country: address.country } : {}),
          },
        }
      : {}),
  };
}

/** Maps infrastructure failures to a clean 503 so pages can show a friendly message. */
async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof ShopifyError && /cursor/i.test(error.message)) throw error;
    logger.error({ err: error }, "Orders lookup failed");
    throw new AppError(
      503,
      "orders_unavailable",
      "We couldn't load your orders right now. Please try again shortly.",
    );
  }
}

const quoted = (value: string) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

export type OrdersCursor = { after?: string | undefined; before?: string | undefined };

async function fetchOrders(owner: Owner, cursor: OrdersCursor): Promise<OrderPage> {
  const backwards = cursor.before !== undefined && cursor.after === undefined;
  const data = ordersResponse.parse(
    await adminQuery(ORDERS_QUERY, {
      first: backwards ? null : ORDERS_PAGE_SIZE,
      last: backwards ? ORDERS_PAGE_SIZE : null,
      after: cursor.after ?? null,
      before: backwards ? cursor.before : null,
      query: `email:${quoted(owner.email)}`,
    }),
  );
  const { pageInfo } = data.orders;
  return {
    // Defense in depth: never trust a search match, only exact ownership.
    orders: data.orders.nodes.filter((node) => belongsTo(owner, node)).map(summarize),
    pageInfo: {
      hasNextPage: pageInfo.hasNextPage,
      hasPreviousPage: pageInfo.hasPreviousPage,
      ...(pageInfo.startCursor ? { startCursor: pageInfo.startCursor } : {}),
      ...(pageInfo.endCursor ? { endCursor: pageInfo.endCursor } : {}),
    },
  };
}

/** One page (10) of the signed-in customer's orders, newest first. */
export async function listOrders(userId: string, cursor: OrdersCursor): Promise<OrderPage> {
  const owner = await loadOwner(userId);
  return guarded(async () => {
    try {
      return await fetchOrders(owner, cursor);
    } catch (error) {
      const hasCursor = cursor.after !== undefined || cursor.before !== undefined;
      if (hasCursor && error instanceof ShopifyError && /cursor/i.test(error.message)) {
        return fetchOrders(owner, {});
      }
      throw error;
    }
  });
}

/** One order, or undefined (404) when it doesn't exist OR belongs to someone else; both look identical. */
export async function getOrder(userId: string, id: string): Promise<OrderDetail | undefined> {
  if (!ORDER_ID.test(id)) return undefined;
  const owner = await loadOwner(userId);
  return guarded(async () => {
    const { order } = orderResponse.parse(await adminQuery(ORDER_QUERY, { id: gidFor(id) }));
    return order && belongsTo(owner, order) ? detail(order) : undefined;
  });
}
