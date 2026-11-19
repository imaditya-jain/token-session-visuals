import "server-only";

import { z } from "zod";

const policy = z.object({ title: z.string(), body: z.string() }).nullable();

export const shopPoliciesResponse = z.object({
  shop: z.object({
    privacyPolicy: policy,
    termsOfService: policy,
    shippingPolicy: policy,
    refundPolicy: policy,
  }),
});
