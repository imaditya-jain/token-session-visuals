import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { resetPaging, shopHref, type PageInfo, type ShopQuery } from "@/lib/shop";

const control =
  "inline-flex min-h-11 items-center gap-2 rounded-md border px-5 py-3 text-sm font-semibold transition-colors sm:px-7";
const enabled = `${control} border-forest bg-transparent text-forest hover:bg-forest hover:text-cream`;
const disabled = `${control} cursor-not-allowed border-border text-muted-foreground/60`;

/** Cursor-based Previous/Next pagination. Cursors are opaque; links carry the current filters. */
export default function ShopPagination({
  query,
  pageInfo,
}: {
  query: ShopQuery;
  pageInfo: PageInfo;
}) {
  const { hasNextPage, hasPreviousPage, startCursor, endCursor } = pageInfo;
  if (!hasNextPage && !hasPreviousPage) return null;

  const filters = resetPaging(query);
  const previous =
    hasPreviousPage && startCursor
      ? shopHref({ ...filters, before: startCursor, page: Math.max(1, query.page - 1) })
      : null;
  const next =
    hasNextPage && endCursor
      ? shopHref({ ...filters, after: endCursor, page: query.page + 1 })
      : null;

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-center gap-3 pb-16 sm:gap-6 lg:pb-24"
    >
      {previous ? (
        <Link href={previous} rel="prev" className={enabled}>
          <ChevronLeft className="size-4" aria-hidden /> Previous
        </Link>
      ) : (
        <span aria-disabled="true" className={disabled}>
          <ChevronLeft className="size-4" aria-hidden /> Previous
        </span>
      )}
      <span className="text-sm font-medium text-muted-foreground" aria-current="page">
        Page {query.page}
      </span>
      {next ? (
        <Link href={next} rel="next" className={enabled}>
          Next <ChevronRight className="size-4" aria-hidden />
        </Link>
      ) : (
        <span aria-disabled="true" className={disabled}>
          Next <ChevronRight className="size-4" aria-hidden />
        </span>
      )}
    </nav>
  );
}
