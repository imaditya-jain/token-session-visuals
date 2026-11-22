"use client";

import IconButton from "@/components/admin/IconButton";
import { Button } from "@/components/ui/button";
import { moveItem, patchAt, removeAt } from "@/lib/array-edit";

export type LinkRow = { label: string; href: string };

const field =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** An ordered list of "label → link" rows with reorder and remove, used for menus, footer columns and legal links. */
export default function LinkRows<T extends LinkRow>({
  title,
  rows,
  onChange,
  makeRow,
  max,
  addLabel = "Add link",
}: {
  title: string;
  rows: T[];
  onChange: (rows: T[]) => void;
  makeRow: () => T;
  max: number;
  addLabel?: string;
}) {
  return (
    <ul aria-label={title} className="space-y-3">
      {rows.map((row, index) => (
        <li
          key={index}
          className="flex flex-wrap items-end gap-2 rounded-lg bg-background p-3 ring-1 ring-border/60"
        >
          <div className="min-w-[8rem] flex-1">
            <label
              className="mb-1 block text-xs text-muted-foreground"
              htmlFor={`${title}-label-${index}`}
            >
              Label
            </label>
            <input
              id={`${title}-label-${index}`}
              value={row.label}
              maxLength={40}
              onChange={(event) =>
                onChange(patchAt(rows, index, { label: event.target.value } as Partial<T>))
              }
              className={field}
            />
          </div>
          <div className="min-w-[12rem] flex-[2]">
            <label
              className="mb-1 block text-xs text-muted-foreground"
              htmlFor={`${title}-href-${index}`}
            >
              Link
            </label>
            <input
              id={`${title}-href-${index}`}
              value={row.href}
              placeholder="/shop or https://…"
              onChange={(event) =>
                onChange(patchAt(rows, index, { href: event.target.value } as Partial<T>))
              }
              className={field}
            />
          </div>
          <div className="flex">
            <IconButton
              label={`Move ${row.label || "link"} up`}
              disabled={index === 0}
              onClick={() => onChange(moveItem(rows, index, -1))}
            >
              ↑
            </IconButton>
            <IconButton
              label={`Move ${row.label || "link"} down`}
              disabled={index === rows.length - 1}
              onClick={() => onChange(moveItem(rows, index, 1))}
            >
              ↓
            </IconButton>
            <IconButton
              label={`Remove ${row.label || "link"}`}
              danger
              onClick={() => onChange(removeAt(rows, index))}
            >
              ✕
            </IconButton>
          </div>
        </li>
      ))}
      {rows.length < max ? (
        <li>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => onChange([...rows, makeRow()])}
          >
            {addLabel}
          </Button>
        </li>
      ) : null}
    </ul>
  );
}
