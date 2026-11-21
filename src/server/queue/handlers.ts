import "server-only";

import { z } from "zod";

import { gidSchema, MIRROR_RESOURCES } from "@/lib/shopify-gid";
import { requestCustomerErasure } from "@/server/services/customer-erasure";
import { syncCustomer } from "@/server/services/customer-sync";
import { syncMarketingConsentToShopify } from "@/server/services/customer-marketing";
import { markDeleted, mirrorOne, mirrorPage } from "@/server/services/shopify-mirror";

/** A job a handler asks to be queued once it succeeds (keeps handlers free of the queue implementation). */
export type FollowUp = { type: JobType; payload: Record<string, unknown>; key?: string };

const resource = z.enum(MIRROR_RESOURCES);

const mirrorTarget = z
  .object({ resource, gid: z.string() })
  .refine((value) => gidSchema(value.resource).safeParse(value.gid).success, {
    message: "GID does not match the resource type",
    path: ["gid"],
  });

/** Every background job: validated payload shape plus the function that does the work. */
export const jobHandlers = {
  "shopify.customer.sync": {
    schema: z.object({ userId: z.string().regex(/^[a-f\d]{24}$/i) }),
    run: async ({ userId }: { userId: string }): Promise<FollowUp[] | void> => {
      const { marketingSubscriberId } = await syncCustomer(userId);
      // The customer now exists: bring its marketing consent in line with the mailing list.
      if (marketingSubscriberId)
        return [
          {
            type: "shopify.customer.marketing",
            payload: { subscriberId: marketingSubscriberId },
            key: marketingSubscriberId,
          },
        ];
    },
  },
  /** Mirrors a mailing-list decision (confirmed or unsubscribed) onto the matching Shopify customer, if any. */
  "shopify.customer.marketing": {
    schema: z.object({ subscriberId: z.string().regex(/^[a-f\d]{24}$/i) }),
    run: async ({ subscriberId }: { subscriberId: string }): Promise<FollowUp[] | void> => {
      await syncMarketingConsentToShopify(subscriberId);
    },
  },
  "shopify.customer.erase": {
    // Only the Shopify id: the account (and its email) is already gone when this runs.
    schema: z.object({ customerGid: gidSchema("customer") }),
    run: async ({ customerGid }: { customerGid: string }): Promise<FollowUp[] | void> => {
      await requestCustomerErasure(customerGid);
    },
  },
  "shopify.mirror.sync": {
    schema: mirrorTarget,
    run: async (job: z.infer<typeof mirrorTarget>): Promise<FollowUp[] | void> => {
      await mirrorOne(job.resource, job.gid);
    },
  },
  "shopify.mirror.delete": {
    schema: mirrorTarget,
    run: async (job: z.infer<typeof mirrorTarget>): Promise<FollowUp[] | void> => {
      await markDeleted(job.resource, job.gid);
    },
  },
  /** Walks one resource page by page: each page queues the next, so no single job runs long. */
  "shopify.mirror.backfill": {
    schema: z.object({ resource, cursor: z.string().min(1).max(500).optional() }),
    run: async (job: {
      resource: z.infer<typeof resource>;
      cursor?: string | undefined;
    }): Promise<FollowUp[] | void> => {
      const { nextCursor } = await mirrorPage(job.resource, job.cursor ?? null);
      if (!nextCursor) return;
      return [
        {
          type: "shopify.mirror.backfill",
          payload: { resource: job.resource, cursor: nextCursor },
          key: `backfill:${job.resource}:${nextCursor}`,
        },
      ];
    },
  },
} as const;

export type JobType = keyof typeof jobHandlers;
