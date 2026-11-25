import "server-only";

import { z } from "zod";

import type {
  Address,
  Money,
  OrderDetail,
  OrderListPage,
  OrderListQuery,
} from "@/lib/orders-admin";

import { adminQuery } from "./admin";
import { ShopifyUserError } from "./product-admin";

const run = async <S extends z.ZodType>(
  schema: S,
  query: string,
  variables: Record<string, unknown>,
) => schema.parse(await adminQuery(query, variables)) as z.infer<S>;

const userErrors = z.array(
  z.object({ field: z.array(z.string()).nullable().optional(), message: z.string() }),
);
function assertOk(errors: z.infer<typeof userErrors> | undefined | null): void {
  if (errors && errors.length > 0)
    throw new ShopifyUserError(errors.map((e) => e.message).join(" "));
}

const moneyBag = z.object({
  shopMoney: z.object({ amount: z.string(), currencyCode: z.string() }),
});
const toMoney = (bag: z.infer<typeof moneyBag>): Money => ({
  amount: bag.shopMoney.amount,
  currency: bag.shopMoney.currencyCode,
});
const MONEY = "{ shopMoney { amount currencyCode } }";

// ---- Search string ---------------------------------------------------------------------------------------------------

/** Free text becomes safe search words: Shopify's search syntax characters can't be injected. */
export const orderSearchTerms = (text: string): string =>
  text
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}@.#_+-]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .map((t) => t.slice(0, 60))
    .join(" ");

export function buildOrderQuery(q: Partial<OrderListQuery>): string {
  const parts: string[] = [];
  if (q.state === "open") parts.push("status:open");
  else if (q.state === "cancelled") parts.push("status:cancelled");
  if (q.payment) parts.push(`financial_status:${q.payment.toLowerCase()}`);
  if (q.fulfillment) parts.push(`fulfillment_status:${q.fulfillment.toLowerCase()}`);
  if (q.from) parts.push(`created_at:>=${q.from}`);
  if (q.to) parts.push(`created_at:<=${q.to}T23:59:59Z`);
  const terms = q.search ? orderSearchTerms(q.search) : "";
  if (terms) parts.push(`(${terms})`);
  return parts.join(" ");
}

// ---- List --------------------------------------------------------------------------------------------------------------

const listSchema = z.object({
  orders: z.object({
    pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }),
    nodes: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        createdAt: z.string(),
        cancelledAt: z.string().nullable(),
        displayFinancialStatus: z.string().nullable(),
        displayFulfillmentStatus: z.string(),
        tags: z.array(z.string()),
        sourceName: z.string().nullable(),
        subtotalLineItemsQuantity: z.number(),
        currentTotalPriceSet: moneyBag,
        customer: z.object({ displayName: z.string() }).nullable(),
        billingAddress: z.object({ name: z.string().nullable() }).nullable(),
      }),
    ),
  }),
});

const LIST = /* GraphQL */ `
  query AdminOrders($first: Int!, $after: String, $query: String!) {
    orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id name createdAt cancelledAt displayFinancialStatus displayFulfillmentStatus tags sourceName
        subtotalLineItemsQuantity
        currentTotalPriceSet ${MONEY}
        customer { displayName }
        billingAddress { name }
      }
    }
  }
`;

export async function listOrders(
  query: Partial<OrderListQuery>,
  pageSize = 25,
): Promise<OrderListPage> {
  const data = await run(listSchema, LIST, {
    first: pageSize,
    after: query.after ?? null,
    query: buildOrderQuery(query),
  });
  return {
    nextCursor: data.orders.pageInfo.hasNextPage ? data.orders.pageInfo.endCursor : null,
    items: data.orders.nodes.map((o) => ({
      id: o.id,
      name: o.name,
      createdAt: o.createdAt,
      customerName: o.customer?.displayName || o.billingAddress?.name || "Guest",
      payment: o.displayFinancialStatus ?? "PENDING",
      fulfillment: o.displayFulfillmentStatus,
      cancelled: o.cancelledAt !== null,
      total: toMoney(o.currentTotalPriceSet),
      itemCount: o.subtotalLineItemsQuantity,
      tags: o.tags,
      channel: o.sourceName ?? "",
    })),
  };
}

// ---- Detail --------------------------------------------------------------------------------------------------------------

const addressSchema = z
  .object({
    name: z.string().nullable(),
    address1: z.string().nullable(),
    address2: z.string().nullable().optional(),
    city: z.string().nullable(),
    province: z.string().nullable(),
    zip: z.string().nullable(),
    country: z.string().nullable(),
    phone: z.string().nullable().optional(),
  })
  .nullable();

const toAddress = (a: z.infer<typeof addressSchema>): Address | null =>
  a
    ? {
        name: a.name ?? "",
        address1: a.address1 ?? "",
        address2: a.address2 ?? "",
        city: a.city ?? "",
        province: a.province ?? "",
        zip: a.zip ?? "",
        country: a.country ?? "",
        phone: a.phone ?? "",
      }
    : null;

const ADDRESS = "{ name address1 address2 city province zip country phone }";

const detailSchema = z.object({
  order: z
    .object({
      id: z.string(),
      name: z.string(),
      createdAt: z.string(),
      cancelledAt: z.string().nullable(),
      cancelReason: z.string().nullable(),
      note: z.string().nullable(),
      tags: z.array(z.string()),
      email: z.string().nullable(),
      sourceName: z.string().nullable(),
      currencyCode: z.string(),
      displayFinancialStatus: z.string().nullable(),
      displayFulfillmentStatus: z.string(),
      customer: z
        .object({
          id: z.string(),
          displayName: z.string(),
          email: z.string().nullable(),
          phone: z.string().nullable(),
          numberOfOrders: z.union([z.string(), z.number()]),
        })
        .nullable(),
      shippingAddress: addressSchema,
      billingAddress: addressSchema,
      shippingLine: z.object({ title: z.string() }).nullable(),
      subtotalPriceSet: moneyBag,
      totalShippingPriceSet: moneyBag,
      totalTaxSet: moneyBag,
      totalDiscountsSet: moneyBag,
      currentTotalPriceSet: moneyBag,
      totalRefundedSet: moneyBag,
      totalReceivedSet: moneyBag,
      lineItems: z.object({
        nodes: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            variantTitle: z.string().nullable(),
            sku: z.string().nullable(),
            quantity: z.number(),
            refundableQuantity: z.number(),
            image: z.object({ url: z.string() }).nullable(),
            originalUnitPriceSet: moneyBag,
            discountedUnitPriceSet: moneyBag,
            product: z.object({ id: z.string() }).nullable(),
          }),
        ),
      }),
      fulfillmentOrders: z.object({
        nodes: z.array(
          z.object({
            id: z.string(),
            status: z.string(),
            assignedLocation: z.object({ name: z.string() }).nullable(),
            lineItems: z.object({
              nodes: z.array(
                z.object({
                  id: z.string(),
                  remainingQuantity: z.number(),
                  totalQuantity: z.number(),
                  lineItem: z.object({ title: z.string() }),
                }),
              ),
            }),
          }),
        ),
      }),
      fulfillments: z.array(
        z.object({
          id: z.string(),
          status: z.string(),
          createdAt: z.string(),
          trackingInfo: z.array(
            z.object({
              company: z.string().nullable(),
              number: z.string().nullable(),
              url: z.string().nullable(),
            }),
          ),
        }),
      ),
      transactions: z.array(
        z.object({
          id: z.string(),
          kind: z.string(),
          status: z.string(),
          gateway: z.string().nullable(),
          amountSet: moneyBag,
          processedAt: z.string().nullable(),
        }),
      ),
      refunds: z.array(
        z.object({
          id: z.string(),
          createdAt: z.string(),
          note: z.string().nullable(),
          totalRefundedSet: moneyBag,
        }),
      ),
      events: z.object({
        nodes: z.array(z.object({ message: z.string(), createdAt: z.string() })),
      }),
    })
    .nullable(),
});

const DETAIL = /* GraphQL */ `
  query AdminOrder($id: ID!) {
    order(id: $id) {
      id name createdAt cancelledAt cancelReason note tags email sourceName currencyCode
      displayFinancialStatus displayFulfillmentStatus
      customer { id displayName email phone numberOfOrders }
      shippingAddress ${ADDRESS}
      billingAddress ${ADDRESS}
      shippingLine { title }
      subtotalPriceSet ${MONEY}
      totalShippingPriceSet ${MONEY}
      totalTaxSet ${MONEY}
      totalDiscountsSet ${MONEY}
      currentTotalPriceSet ${MONEY}
      totalRefundedSet ${MONEY}
      totalReceivedSet ${MONEY}
      lineItems(first: 100) {
        nodes {
          id title variantTitle sku quantity refundableQuantity image { url }
          originalUnitPriceSet ${MONEY}
          discountedUnitPriceSet ${MONEY}
          product { id }
        }
      }
      fulfillmentOrders(first: 20) {
        nodes {
          id status assignedLocation { name }
          lineItems(first: 100) { nodes { id remainingQuantity totalQuantity lineItem { title } } }
        }
      }
      fulfillments { id status createdAt trackingInfo { company number url } }
      transactions(first: 50) { id kind status gateway amountSet ${MONEY} processedAt }
      refunds { id createdAt note totalRefundedSet ${MONEY} }
      events(first: 40, reverse: true) { nodes { message createdAt } }
    }
  }
`;

export async function getOrder(id: string): Promise<OrderDetail | null> {
  const { order: o } = await run(detailSchema, DETAIL, { id });
  if (!o) return null;
  return {
    id: o.id,
    name: o.name,
    createdAt: o.createdAt,
    cancelledAt: o.cancelledAt,
    cancelReason: o.cancelReason,
    payment: o.displayFinancialStatus ?? "PENDING",
    fulfillment: o.displayFulfillmentStatus,
    note: o.note ?? "",
    tags: o.tags,
    channel: o.sourceName ?? "",
    currency: o.currencyCode,
    customer: o.customer
      ? {
          id: o.customer.id,
          name: o.customer.displayName,
          email: o.customer.email ?? "",
          phone: o.customer.phone ?? "",
          orders: Number(o.customer.numberOfOrders) || 0,
        }
      : null,
    email: o.email ?? "",
    shippingAddress: toAddress(o.shippingAddress),
    billingAddress: toAddress(o.billingAddress),
    shippingMethod: o.shippingLine?.title ?? "",
    lines: o.lineItems.nodes.map((l) => ({
      id: l.id,
      title: l.title,
      variantTitle: l.variantTitle ?? "",
      sku: l.sku ?? "",
      quantity: l.quantity,
      refundableQuantity: l.refundableQuantity,
      imageUrl: l.image?.url ?? null,
      unitPrice: toMoney(l.originalUnitPriceSet),
      discountedUnitPrice: toMoney(l.discountedUnitPriceSet),
      productId: l.product?.id ?? null,
    })),
    totals: {
      subtotal: toMoney(o.subtotalPriceSet),
      shipping: toMoney(o.totalShippingPriceSet),
      tax: toMoney(o.totalTaxSet),
      discounts: toMoney(o.totalDiscountsSet),
      total: toMoney(o.currentTotalPriceSet),
      refunded: toMoney(o.totalRefundedSet),
      received: toMoney(o.totalReceivedSet),
    },
    fulfillmentOrders: o.fulfillmentOrders.nodes.map((f) => ({
      id: f.id,
      status: f.status,
      location: f.assignedLocation?.name ?? "",
      lines: f.lineItems.nodes.map((l) => ({
        id: l.id,
        title: l.lineItem.title,
        remaining: l.remainingQuantity,
        total: l.totalQuantity,
      })),
    })),
    fulfillments: o.fulfillments.map((f) => ({
      id: f.id,
      status: f.status,
      createdAt: f.createdAt,
      tracking: f.trackingInfo.map((t) => ({
        company: t.company ?? "",
        number: t.number ?? "",
        url: t.url ?? "",
      })),
    })),
    transactions: o.transactions.map((t) => ({
      id: t.id,
      kind: t.kind,
      status: t.status,
      gateway: t.gateway ?? "",
      amount: toMoney(t.amountSet),
      processedAt: t.processedAt,
    })),
    refunds: o.refunds.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      note: r.note ?? "",
      amount: toMoney(r.totalRefundedSet),
    })),
    timeline: o.events.nodes.map((e) => ({ message: e.message, createdAt: e.createdAt })),
  };
}

// ---- Changes ---------------------------------------------------------------------------------------------------------------

export async function updateOrder(
  id: string,
  patch: { note?: string | undefined; tags?: string[] | undefined },
): Promise<void> {
  const data = await run(
    z.object({ orderUpdate: z.object({ userErrors: userErrors }) }),
    /* GraphQL */ `
      mutation AdminOrderUpdate($input: OrderInput!) {
        orderUpdate(input: $input) {
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      input: {
        id,
        ...(patch.note !== undefined ? { note: patch.note } : {}),
        ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
      },
    },
  );
  assertOk(data.orderUpdate.userErrors);
}

export async function createFulfillment(input: {
  fulfillmentOrderId: string;
  lines?: { id: string; quantity: number }[] | undefined;
  trackingCompany: string;
  trackingNumber: string;
  trackingUrl: string;
  notifyCustomer: boolean;
}): Promise<void> {
  const hasTracking = input.trackingNumber !== "" || input.trackingUrl !== "";
  const data = await run(
    z.object({ fulfillmentCreate: z.object({ userErrors: userErrors }) }),
    /* GraphQL */ `
      mutation AdminFulfil($fulfillment: FulfillmentInput!) {
        fulfillmentCreate(fulfillment: $fulfillment) {
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      fulfillment: {
        notifyCustomer: input.notifyCustomer,
        ...(hasTracking
          ? {
              trackingInfo: {
                ...(input.trackingCompany ? { company: input.trackingCompany } : {}),
                ...(input.trackingNumber ? { number: input.trackingNumber } : {}),
                ...(input.trackingUrl ? { url: input.trackingUrl } : {}),
              },
            }
          : {}),
        lineItemsByFulfillmentOrder: [
          {
            fulfillmentOrderId: input.fulfillmentOrderId,
            ...(input.lines
              ? {
                  fulfillmentOrderLineItems: input.lines.map((l) => ({
                    id: l.id,
                    quantity: l.quantity,
                  })),
                }
              : {}),
          },
        ],
      },
    },
  );
  assertOk(data.fulfillmentCreate.userErrors);
}

export async function cancelOrder(
  id: string,
  options: {
    reason: string;
    refund: boolean;
    restock: boolean;
    notifyCustomer: boolean;
    staffNote: string;
  },
): Promise<void> {
  const data = await run(
    z.object({
      orderCancel: z.object({ orderCancelUserErrors: userErrors }),
    }),
    /* GraphQL */ `
      mutation AdminOrderCancel(
        $orderId: ID!
        $reason: OrderCancelReason!
        $refund: Boolean!
        $restock: Boolean!
        $notifyCustomer: Boolean
        $staffNote: String
      ) {
        orderCancel(
          orderId: $orderId
          reason: $reason
          refund: $refund
          restock: $restock
          notifyCustomer: $notifyCustomer
          staffNote: $staffNote
        ) {
          orderCancelUserErrors {
            field
            message
          }
        }
      }
    `,
    {
      orderId: id,
      reason: options.reason,
      refund: options.refund,
      restock: options.restock,
      notifyCustomer: options.notifyCustomer,
      staffNote: options.staffNote || null,
    },
  );
  assertOk(data.orderCancel.orderCancelUserErrors);
}

const suggestedSchema = z.object({
  order: z
    .object({
      suggestedRefund: z
        .object({
          suggestedTransactions: z.array(
            z.object({
              amountSet: moneyBag,
              gateway: z.string(),
              kind: z.string(),
              parentTransaction: z.object({ id: z.string() }).nullable(),
            }),
          ),
        })
        .nullable(),
    })
    .nullable(),
});

export type RefundRequest = {
  lines: { lineItemId: string; quantity: number; restock: boolean }[];
  refundShipping: boolean;
  note: string;
  notifyCustomer: boolean;
};

/** The first active location, used as the destination when refunded items are put back into stock. */
async function restockLocation(): Promise<string | null> {
  const data = await run(
    z.object({ locations: z.object({ nodes: z.array(z.object({ id: z.string() })) }) }),
    /* GraphQL */ `
      query AdminRestockLocation {
        locations(first: 1, query: "active:true") {
          nodes {
            id
          }
        }
      }
    `,
    {},
  );
  return data.locations.nodes[0]?.id ?? null;
}

/** Refunds exactly what Shopify itself suggests for the chosen items, so the money always matches the order. */
export async function refundOrder(id: string, request: RefundRequest): Promise<Money> {
  if (request.lines.length === 0 && !request.refundShipping)
    throw new ShopifyUserError("Choose at least one item or the shipping to refund.");
  const refundLineItems = request.lines.map((l) => ({
    lineItemId: l.lineItemId,
    quantity: l.quantity,
  }));
  const suggested = await run(
    suggestedSchema,
    /* GraphQL */ `
      query AdminSuggestedRefund($id: ID!, $items: [RefundLineItemInput!], $shipping: Boolean) {
        order(id: $id) {
          suggestedRefund(refundLineItems: $items, refundShipping: $shipping) {
            suggestedTransactions {
              amountSet ${MONEY}
              gateway
              kind
              parentTransaction { id }
            }
          }
        }
      }
    `,
    { id, items: refundLineItems, shipping: request.refundShipping },
  );
  const transactions = suggested.order?.suggestedRefund?.suggestedTransactions ?? [];
  if (transactions.length === 0)
    throw new ShopifyUserError("Nothing can be refunded for that selection.");
  const location = request.lines.some((l) => l.restock) ? await restockLocation() : null;
  const data = await run(
    z.object({
      refundCreate: z.object({
        userErrors: userErrors,
        refund: z.object({ totalRefundedSet: moneyBag }).nullable(),
      }),
    }),
    /* GraphQL */ `
      mutation AdminRefund($input: RefundInput!) {
        refundCreate(input: $input) {
          userErrors { field message }
          refund { totalRefundedSet ${MONEY} }
        }
      }
    `,
    {
      input: {
        orderId: id,
        note: request.note || null,
        notify: request.notifyCustomer,
        refundLineItems: request.lines.map((l) => ({
          lineItemId: l.lineItemId,
          quantity: l.quantity,
          restockType: l.restock && location ? "RETURN" : "NO_RESTOCK",
          ...(l.restock && location ? { locationId: location } : {}),
        })),
        ...(request.refundShipping ? { shipping: { fullRefund: true } } : {}),
        transactions: transactions.map((t) => ({
          orderId: id,
          parentId: t.parentTransaction?.id,
          amount: t.amountSet.shopMoney.amount,
          gateway: t.gateway,
          kind: "REFUND",
        })),
      },
    },
  );
  assertOk(data.refundCreate.userErrors);
  if (!data.refundCreate.refund) throw new ShopifyUserError("Shopify did not create the refund.");
  return toMoney(data.refundCreate.refund.totalRefundedSet);
}

// ---- Analytics ---------------------------------------------------------------------------------------------------------

const salesSchema = z.object({
  orders: z.object({
    pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }),
    nodes: z.array(
      z.object({
        createdAt: z.string(),
        cancelledAt: z.string().nullable(),
        displayFinancialStatus: z.string().nullable(),
        currentTotalPriceSet: moneyBag,
        totalRefundedSet: moneyBag,
        customer: z
          .object({ id: z.string(), numberOfOrders: z.union([z.string(), z.number()]) })
          .nullable(),
        lineItems: z.object({
          nodes: z.array(
            z.object({
              title: z.string(),
              currentQuantity: z.number(),
              discountedTotalSet: moneyBag,
            }),
          ),
        }),
      }),
    ),
  }),
});

const SALES = /* GraphQL */ `
  query AdminSalesOrders($query: String!, $after: String) {
    orders(first: 50, after: $after, query: $query, sortKey: CREATED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes {
        createdAt cancelledAt displayFinancialStatus
        currentTotalPriceSet ${MONEY}
        totalRefundedSet ${MONEY}
        customer { id numberOfOrders }
        lineItems(first: 15) { nodes { title currentQuantity discountedTotalSet ${MONEY} } }
      }
    }
  }
`;

export type SalesOrder = {
  createdAt: string;
  counted: boolean;
  total: Money;
  refunded: Money;
  customerId: string | null;
  customerOrders: number;
  lines: { title: string; quantity: number; amount: Money }[];
};

const MAX_SALES_PAGES = 40;

/** Orders created between two dates (UTC, inclusive), up to 2,000. `capped` says whether there were more. */
export async function salesOrders(
  from: string,
  to: string,
): Promise<{ orders: SalesOrder[]; capped: boolean }> {
  const query = `created_at:>=${from}T00:00:00Z created_at:<=${to}T23:59:59Z`;
  const orders: SalesOrder[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_SALES_PAGES; page++) {
    const data: z.infer<typeof salesSchema> = await run(salesSchema, SALES, { query, after });
    for (const o of data.orders.nodes) {
      orders.push({
        createdAt: o.createdAt,
        counted: o.cancelledAt === null && o.displayFinancialStatus !== "VOIDED",
        total: toMoney(o.currentTotalPriceSet),
        refunded: toMoney(o.totalRefundedSet),
        customerId: o.customer?.id ?? null,
        customerOrders: o.customer ? Number(o.customer.numberOfOrders) || 0 : 0,
        lines: o.lineItems.nodes.map((l) => ({
          title: l.title,
          quantity: l.currentQuantity,
          amount: toMoney(l.discountedTotalSet),
        })),
      });
    }
    if (!data.orders.pageInfo.hasNextPage) return { orders, capped: false };
    after = data.orders.pageInfo.endCursor;
  }
  return { orders, capped: true };
}

/** How many orders still wait to be shipped (open, unfulfilled or partly). Counted exactly up to 250. */
export async function unfulfilledCount(): Promise<number> {
  const data = await run(
    z.object({ ordersCount: z.object({ count: z.number() }) }),
    /* GraphQL */ `
      query AdminUnfulfilledCount {
        ordersCount(
          query: "status:open fulfillment_status:unfulfilled OR fulfillment_status:partial"
          limit: 250
        ) {
          count
        }
      }
    `,
    {},
  );
  return data.ordersCount.count;
}
