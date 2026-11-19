"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export default function FilterPopover({
  label,
  activeCount,
  children,
}: {
  label: string;
  activeCount: number;
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-forest hover:text-forest data-[state=open]:border-forest data-[state=open]:text-forest">
          {label}
          {activeCount > 0 && (
            <span className="rounded-full bg-clay px-1.5 text-[11px] font-bold text-cream">
              {activeCount}
            </span>
          )}
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 rounded-xl border-border bg-card p-5">
        {children}
      </PopoverContent>
    </Popover>
  );
}
