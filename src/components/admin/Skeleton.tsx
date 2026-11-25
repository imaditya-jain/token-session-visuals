const bar = "rounded-md bg-muted motion-safe:animate-pulse";

/**
 * Placeholder shown while an admin screen loads. It mirrors the shape of what is coming (a list, a card grid or a
 * form) so the page doesn't jump, and announces "Loading" once to assistive technology.
 */
export default function Skeleton({
  variant = "list",
  rows = 6,
}: {
  variant?: "list" | "grid" | "form" | "cards";
  rows?: number;
}) {
  return (
    <div role="status" aria-busy="true" className="w-full">
      <span className="sr-only">Loading</span>
      <div aria-hidden="true">
        {variant === "list" ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className={`${bar} h-11 w-28 rounded-full`} />
              <div className={`${bar} h-11 w-28 rounded-full`} />
              <div className={`${bar} h-11 w-28 rounded-full`} />
            </div>
            <div className="divide-y divide-border rounded-xl bg-card ring-1 ring-border/60">
              {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-4">
                  <div className={`${bar} h-10 w-10 shrink-0`} />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className={`${bar} h-4 w-2/5`} />
                    <div className={`${bar} h-3 w-3/5`} />
                  </div>
                  <div className={`${bar} hidden h-4 w-20 sm:block`} />
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {variant === "grid" ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: rows + 4 }, (_, i) => (
              <div key={i} className={`${bar} aspect-square`} />
            ))}
          </div>
        ) : null}
        {variant === "cards" ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: rows }, (_, i) => (
              <div key={i} className="space-y-3 rounded-xl bg-card p-5 ring-1 ring-border/60">
                <div className={`${bar} h-3 w-1/3`} />
                <div className={`${bar} h-8 w-2/3`} />
                <div className={`${bar} h-3 w-1/2`} />
              </div>
            ))}
          </div>
        ) : null}
        {variant === "form" ? (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
            <div className="space-y-6">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-4 rounded-xl bg-card p-5 ring-1 ring-border/60">
                  <div className={`${bar} h-5 w-32`} />
                  <div className={`${bar} h-11 w-full`} />
                  <div className={`${bar} h-24 w-full`} />
                </div>
              ))}
            </div>
            <div className="space-y-6">
              {[0, 1].map((i) => (
                <div key={i} className="space-y-4 rounded-xl bg-card p-5 ring-1 ring-border/60">
                  <div className={`${bar} h-5 w-24`} />
                  <div className={`${bar} h-11 w-full`} />
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
