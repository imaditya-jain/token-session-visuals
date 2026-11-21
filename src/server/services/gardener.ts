import "server-only";

import type { GardenerService } from "@/lib/gardener";
import { logger } from "@/server/logger";
import { GARDENER_PRODUCT_QUERY } from "@/server/shopify/gardener-queries";
import { gardenerProductResponse } from "@/server/shopify/gardener-schemas";
import { storefrontQuery } from "@/server/shopify/client";

/** Handle of the Shopify product that represents the service (see scripts/seed-services.ts). */
export const GARDENER_HANDLE = "garden-care-visit";

/**
 * Reads the service product and its Seal subscription plans. Returns null when it cannot be booked (not published,
 * out of reach, no variant): the page then shows a neutral notice instead of failing.
 */
export async function getGardenerService(): Promise<GardenerService | null> {
  try {
    const { product } = gardenerProductResponse.parse(
      await storefrontQuery(
        GARDENER_PRODUCT_QUERY,
        { handle: GARDENER_HANDLE },
        { tags: ["catalog", `product:${GARDENER_HANDLE}`], revalidate: 3600 },
      ),
    );
    const variant = product?.variants.nodes[0];
    if (!product || !variant || !product.availableForSale) return null;

    const plans = product.sellingPlanGroups.nodes
      .flatMap((group) => group.sellingPlans.nodes)
      .flatMap((plan) => {
        const price = plan.priceAdjustments[0]?.adjustmentValue.price?.amount;
        return price ? [{ id: plan.id, name: plan.name, price }] : [];
      });

    return {
      title: product.title,
      variantId: variant.id,
      currency: variant.price.currencyCode,
      oneTimePrice: variant.price.amount,
      plans,
    };
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : String(error) },
      "Gardener service unavailable",
    );
    return null;
  }
}
