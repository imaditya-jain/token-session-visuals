import type { ReactNode } from "react";

/** Title block for every console page: the page's single h1, an optional lead and an action slot. */
export default function PageHeader({
  title,
  lead,
  action,
}: {
  title: string;
  lead?: string | undefined;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
      <div>
        <h1 className="font-display text-3xl text-forest sm:text-4xl">{title}</h1>
        {lead ? <p className="mt-2 max-w-2xl text-muted-foreground">{lead}</p> : null}
      </div>
      {action}
    </div>
  );
}
