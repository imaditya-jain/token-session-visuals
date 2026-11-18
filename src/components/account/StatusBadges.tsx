import { type OrderSummary, statusLabel } from "@/lib/orders";

const badge = "rounded-sm px-2.5 py-1 text-xs font-semibold";

export default function StatusBadges({
  order,
}: {
  order: Pick<OrderSummary, "financialStatus" | "fulfillmentStatus" | "cancelled">;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {order.cancelled ? (
        <span className={`${badge} bg-destructive/10 text-destructive`}>Cancelled</span>
      ) : null}
      <span className={`${badge} bg-sage-light text-forest`}>
        {statusLabel(order.financialStatus)}
      </span>
      <span className={`${badge} bg-sand text-forest`}>{statusLabel(order.fulfillmentStatus)}</span>
    </div>
  );
}
