import { z } from "zod";

export const SUBSCRIPTION_STATUSES = ["ACTIVE", "PAUSED", "CANCELLED", "EXPIRED"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const subscriptionListQuerySchema = z.object({
  status: z.enum(["ACTIVE", "PAUSED", "CANCELLED"]).optional(),
  search: z
    .string()
    .trim()
    .max(100)
    // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
    .refine((v) => !/[\u0000-\u001f\u007f]/.test(v), "Invalid characters")
    .optional(),
  cursor: z.string().max(500).optional(),
});
export type SubscriptionListQuery = z.infer<typeof subscriptionListQuerySchema>;

export const subscriptionActionSchema = z.object({
  action: z.enum(["pause", "resume", "cancel"]),
});
export type SubscriptionAction = z.infer<typeof subscriptionActionSchema>["action"];

export type SubscriptionListItem = {
  id: string;
  status: string;
  customerName: string;
  email: string;
  plan: string;
  items: string;
  interval: string;
  total: string;
  currency: string;
  startedAt: string | null;
  nextBilling: string | null;
};
export type SubscriptionListPage = { items: SubscriptionListItem[]; nextCursor: string | null };

export type SubscriptionDetail = SubscriptionListItem & {
  cancelledOn: string | null;
  pausedOn: string | null;
  deliveryInterval: string;
  shippingAddress: string[];
  lines: { title: string; sku: string; quantity: number; price: string; plan: string }[];
  billing: {
    id: string;
    date: string;
    completedAt: string | null;
    status: string;
    orderId: string;
    error: string;
  }[];
  log: { content: string; created: string }[];
  orderId: string;
};
