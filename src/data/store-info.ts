/**
 * Facts about the shop that appear on content pages. Shipping figures mirror the shipping settings configured in
 * Shopify (what checkout actually charges); the guarantee and contact details are the ones already shown on the
 * site. If Shopify settings change, update here, because the Storefront API does not expose shipping rates.
 */
export const store = {
  name: "Fernwood",
  email: "hello@fernwood.shop",
  phone: "(503) 555-0142",
  phoneHref: "tel:+15035550142",
  hours: "Mon–Sat, 9am–6pm PST",
  address: "1234 Greenhouse Lane, Portland, OR 97210",
  currency: "USD",
  shipping: {
    countries: 28,
    freeThreshold: 70,
    standard: 8,
    express: 15,
    international: 30,
  },
  guaranteeDays: 30,
} as const;

export const money = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: store.currency,
    minimumFractionDigits: 0,
  }).format(amount);
