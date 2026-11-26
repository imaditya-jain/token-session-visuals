import "server-only";

import { getProducts } from "@/data/catalog";
import { isBouquet } from "@/lib/gift";
import type { GiftOptions } from "@/lib/gift-schemas";
import { badRequest } from "@/server/http/errors";

/**
 * A fresh bouquet can only be ordered with its delivery details (who, where, which day). The form always sends them,
 * but the API must not depend on the form: a request that adds a bouquet without them is refused here.
 */
export async function assertBouquetHasDelivery(
  variantId: string,
  gift: GiftOptions | undefined,
): Promise<void> {
  if (gift?.kind === "bouquet") return;
  const product = (await getProducts()).find((candidate) => candidate.variantId === variantId);
  if (product && isBouquet(product)) {
    throw badRequest(
      "Fresh bouquets need a recipient, address and delivery date.",
      "delivery_details_required",
    );
  }
}
