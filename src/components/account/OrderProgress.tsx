import { Check } from "lucide-react";

import type { OrderSummary } from "@/lib/orders";

const PAID = new Set(["PAID", "PARTIALLY_PAID", "PARTIALLY_REFUNDED", "REFUNDED"]);
const SHIPPED = new Set(["FULFILLED", "PARTIALLY_FULFILLED"]);

/** Placed → Paid → Shipped, worked out from the order's own statuses. A cancelled order shows a plain note instead. */
export default function OrderProgress({
  order,
}: {
  order: Pick<OrderSummary, "financialStatus" | "fulfillmentStatus" | "cancelled">;
}) {
  if (order.cancelled) {
    return (
      <p className="mt-6 rounded-2xl bg-destructive/10 px-5 py-4 text-sm font-medium text-destructive">
        This order was cancelled.
      </p>
    );
  }
  const steps = [
    { label: "Placed", done: true },
    { label: "Paid", done: PAID.has(order.financialStatus) },
    { label: "Shipped", done: SHIPPED.has(order.fulfillmentStatus) },
  ];
  const current = steps.findIndex((step) => !step.done);
  return (
    <ol aria-label="Order progress" className="mt-6 grid grid-cols-3 gap-2">
      {steps.map((step, index) => (
        <li key={step.label} className="flex flex-col items-center text-center">
          <span className="flex w-full items-center">
            <span
              aria-hidden
              className={`h-1 flex-1 rounded-full ${index === 0 ? "opacity-0" : step.done ? "bg-forest" : "bg-border"}`}
            />
            <span
              aria-hidden
              className={`mx-1 flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                step.done
                  ? "bg-forest text-cream"
                  : index === current
                    ? "bg-clay text-cream ring-4 ring-clay/20"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {step.done ? <Check className="size-4" /> : index + 1}
            </span>
            <span
              aria-hidden
              className={`h-1 flex-1 rounded-full ${index === steps.length - 1 ? "opacity-0" : steps[index + 1]?.done ? "bg-forest" : "bg-border"}`}
            />
          </span>
          <span
            className={`mt-2 text-xs font-semibold ${step.done ? "text-forest" : "text-muted-foreground"}`}
          >
            {step.label}
            <span className="sr-only">
              {step.done ? " (done)" : index === current ? " (next)" : ""}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
