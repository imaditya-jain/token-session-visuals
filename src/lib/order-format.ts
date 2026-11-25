import type { Money } from "@/lib/orders-admin";

/** "49.0" + "USD" -> "$49.00". Display only; the amounts themselves stay exact strings. */
export function formatMoney(money: Money): string {
  const value = Number(money.amount);
  if (!Number.isFinite(value)) return money.amount;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: money.currency }).format(
      value,
    );
  } catch {
    return `${value.toFixed(2)} ${money.currency}`;
  }
}

/** PARTIALLY_FULFILLED -> "Partially fulfilled". */
export function statusLabel(status: string): string {
  const text = status.replace(/_/g, " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export type Tone = "good" | "warn" | "bad" | "neutral";

export function paymentTone(status: string): Tone {
  if (status === "PAID") return "good";
  if (["PENDING", "AUTHORIZED", "PARTIALLY_PAID"].includes(status)) return "warn";
  if (["REFUNDED", "PARTIALLY_REFUNDED", "VOIDED"].includes(status)) return "neutral";
  return "bad";
}

export function fulfillmentTone(status: string): Tone {
  if (status === "FULFILLED") return "good";
  if (status === "UNFULFILLED" || status === "PARTIALLY_FULFILLED") return "warn";
  return "neutral";
}

export const toneClass: Record<Tone, string> = {
  good: "bg-forest text-cream",
  warn: "bg-clay/15 text-clay-deep",
  bad: "bg-destructive/15 text-destructive",
  neutral: "bg-muted text-muted-foreground",
};

export const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
