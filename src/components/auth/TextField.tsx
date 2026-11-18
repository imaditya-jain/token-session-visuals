"use client";

import { useId, useState, type ComponentProps } from "react";

import { Input } from "@/components/ui/input";

type Props = Omit<ComponentProps<"input">, "id"> & {
  label: string;
  error?: string | undefined;
  hint?: string;
};

/** Labelled input with accessible error/hint wiring. Password fields get a show/hide toggle. */
export default function TextField({
  label,
  error,
  hint,
  type = "text",
  className,
  ...rest
}: Props) {
  const id = useId();
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null]
    .filter(Boolean)
    .join(" ");
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <Input
          id={id}
          type={isPassword && visible ? "text" : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={`h-11 rounded-md bg-background ${isPassword ? "pr-16" : ""} ${error ? "border-destructive" : ""} ${className ?? ""}`}
          {...rest}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setVisible((value) => !value)}
            aria-pressed={visible}
            className="absolute inset-y-0 right-0 flex min-w-14 items-center justify-center rounded-r-md px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-forest"
          >
            {visible ? "Hide" : "Show"}
          </button>
        ) : null}
      </div>
      {hint && !error ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
