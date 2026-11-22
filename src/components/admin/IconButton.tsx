import type { ReactNode } from "react";

/**
 * A compact button whose visible symbol is decoration and whose name is plain language, so the accessible name
 * never disagrees with what is on screen. 44px touch target.
 */
export default function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-11 min-w-11 items-center justify-center rounded-md px-2 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-35 ${
        danger ? "text-destructive" : "text-forest"
      }`}
    >
      <span aria-hidden>{children}</span>
      <span className="sr-only">{label}</span>
    </button>
  );
}
