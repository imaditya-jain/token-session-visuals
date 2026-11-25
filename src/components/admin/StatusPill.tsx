import { toneClass, type Tone } from "@/lib/order-format";

export default function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${toneClass[tone]}`}
    >
      {label}
    </span>
  );
}
