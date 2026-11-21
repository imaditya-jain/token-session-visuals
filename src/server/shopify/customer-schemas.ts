import "server-only";

import { z } from "zod";

const customer = z.object({ id: z.string(), email: z.string().nullable() });
const userErrors = z.array(
  z.object({ field: z.array(z.string()).nullable(), message: z.string() }),
);

export const customerByEmailResponse = z.object({
  customers: z.object({ nodes: z.array(customer) }),
});
export const customerCreateResponse = z.object({
  customerCreate: z.object({ customer: customer.nullable(), userErrors }),
});
export const customerUpdateResponse = z.object({
  customerUpdate: z.object({ customer: customer.nullable(), userErrors }),
});
export const customerMarketingResponse = z.object({
  customerEmailMarketingConsentUpdate: z.object({
    customer: z.object({ id: z.string() }).nullable(),
    userErrors,
  }),
});
