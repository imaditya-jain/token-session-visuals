import "server-only";

import { isPolicySlug, type Policy, type PolicySlug } from "@/lib/policies";
import { sanitizePolicyHtml } from "@/server/content/sanitize";
import { logger } from "@/server/logger";
import { storefrontQuery } from "@/server/shopify/client";
import { SHOP_POLICIES_QUERY } from "@/server/shopify/policy-queries";
import { shopPoliciesResponse } from "@/server/shopify/policy-schemas";

const FIELD: Record<
  PolicySlug,
  "privacyPolicy" | "termsOfService" | "shippingPolicy" | "refundPolicy"
> = {
  "privacy-policy": "privacyPolicy",
  "terms-of-service": "termsOfService",
  "shipping-policy": "shippingPolicy",
  "refund-policy": "refundPolicy",
};

/**
 * The merchant's policy text, or null when it has not been written yet or Shopify can't be reached.
 * Terms are never invented here: the page shows a neutral notice instead.
 */
export async function getPolicy(slug: string): Promise<Policy | null> {
  if (!isPolicySlug(slug)) return null;
  try {
    const { shop } = shopPoliciesResponse.parse(
      await storefrontQuery(SHOP_POLICIES_QUERY, {}, { tags: ["policies"], revalidate: 3600 }),
    );
    const policy = shop[FIELD[slug]];
    if (!policy || policy.body.trim() === "") return null;
    const html = sanitizePolicyHtml(policy.body);
    return html.trim() === "" ? null : { title: policy.title, html };
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error : String(error), slug },
      "Policy unavailable",
    );
    return null;
  }
}
