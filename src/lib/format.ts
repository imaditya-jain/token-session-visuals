export const formatPrice = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(value);

/** Exact order money (cents), in the order's own currency. */
export const formatMoney = ({ amount, currency }: { amount: string; currency: string }) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(amount));

export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(iso));
