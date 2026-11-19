/** Shop policies the merchant writes in Shopify admin (Settings → Policies), keyed by public URL slug. */
export const POLICY_SLUGS = [
  "privacy-policy",
  "terms-of-service",
  "shipping-policy",
  "refund-policy",
] as const;

export type PolicySlug = (typeof POLICY_SLUGS)[number];

export const isPolicySlug = (value: string): value is PolicySlug =>
  (POLICY_SLUGS as readonly string[]).includes(value);

export const POLICY_TITLES: Record<PolicySlug, string> = {
  "privacy-policy": "Privacy Policy",
  "terms-of-service": "Terms of Service",
  "shipping-policy": "Shipping & Delivery",
  "refund-policy": "Returns & Plant Guarantee",
};

export type Policy = { title: string; html: string };
