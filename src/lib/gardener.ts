/** The gardener service as the page needs it (domain shape, never Shopify's). Money stays as exact strings. */
export type GardenerPlan = {
  /** Shopify selling plan id (Seal subscription). */
  id: string;
  name: string;
  /** Price per visit while subscribed. */
  price: string;
};

export type GardenerService = {
  title: string;
  variantId: string;
  currency: string;
  /** Price of a single visit. */
  oneTimePrice: string;
  plans: GardenerPlan[];
};
