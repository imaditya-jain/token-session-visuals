"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { resetPaging, shopHref, type PageInfo, type ShopQuery } from "@/lib/shop";
import { interceptLinkClick } from "@/lib/use-listing-query";

const control =
  "inline-flex min-h-11 items-center gap-2 rounded-md border px-5 py-3 text-sm font-semibold transition-colors sm:px-7";
const enabled = `${control} border-forest bg-transparent text-forest hover:bg-forest hover:text-cream`;
const disabled = `${control} cursor-not-allowed border-border text-muted-foreground/60`;

/**
 * Previous/Next pagination. Server-rendered listings (search) use opaque cursors; the shop and collection listings
 * work on numbered pages and, with `onNavigate`, change page in the browser without a server round trip. Links carry
 * the current filters either way, so each page still has a real, shareable address.
 */
export default function ListingPagination({
  query,
  pageInfo,
  basePath,
  onNavigate,
}: {
  query: ShopQuery;
  pageInfo: PageInfo;
  basePath: string;
  onNavigate?: (href: string) => void;
}) {
  const { hasNextPage, hasPreviousPage, startCursor, endCursor } = pageInfo;
  if (!hasNextPage && !hasPreviousPage) return null;

  const filters = resetPaging(query);
  const byPage = onNavigate !== undefined;
  const previous = !hasPreviousPage
    ? null
    : byPage
      ? shopHref({ ...filters, page: Math.max(1, query.page - 1) }, basePath)
      : startCursor
        ? shopHref({ ...filters, before: startCursor, page: Math.max(1, query.page - 1) }, basePath)
        : null;
  const next = !hasNextPage
    ? null
    : byPage
      ? shopHref({ ...filters, page: query.page + 1 }, basePath)
      : endCursor
        ? shopHref({ ...filters, after: endCursor, page: query.page + 1 }, basePath)
        : null;
  const click = (href: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (onNavigate) interceptLinkClick(event, href, onNavigate);
  };

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-center gap-3 pb-16 sm:gap-6 lg:pb-24"
    >
      {previous ? (
        <Link href={previous} rel="prev" className={enabled} onClick={click(previous)}>
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
        <Link href={next} rel="next" className={enabled} onClick={click(next)}>
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
