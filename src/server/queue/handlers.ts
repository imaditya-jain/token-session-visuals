import "server-only";

import { z } from "zod";

import { syncCustomer } from "@/server/services/customer-sync";

/** Every background job: validated payload shape plus the function that does the work. */
export const jobHandlers = {
  "shopify.customer.sync": {
    schema: z.object({ userId: z.string().regex(/^[a-f\d]{24}$/i) }),
    run: ({ userId }: { userId: string }) => syncCustomer(userId),
  },
} as const;

export type JobType = keyof typeof jobHandlers;
