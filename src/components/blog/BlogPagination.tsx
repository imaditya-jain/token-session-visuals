import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

const control =
  "inline-flex min-h-11 items-center gap-2 rounded-md border px-5 py-3 text-sm font-semibold transition-colors";
const enabled = `${control} border-forest bg-transparent text-forest hover:bg-forest hover:text-cream`;

/** Previous / next links between pages of a listing. `basePath` is the listing's own path (page 1). */
export default function BlogPagination({
  basePath,
  page,
  pages,
}: {
  basePath: string;
  page: number;
  pages: number;
}) {
  if (pages <= 1) return null;
  const hrefFor = (n: number) => (n <= 1 ? basePath : `${basePath}/page/${n}`);
  return (
    <nav aria-label="Pagination" className="mt-12 flex items-center justify-center gap-3 sm:gap-6">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} rel="prev" className={enabled}>
          <ChevronLeft aria-hidden className="size-4" /> Newer
        </Link>
      ) : null}
      <span className="text-sm text-muted-foreground">
        Page {page} of {pages}
      </span>
      {page < pages ? (
        <Link href={hrefFor(page + 1)} rel="next" className={enabled}>
          Older <ChevronRight aria-hidden className="size-4" />
        </Link>
      ) : null}
    </nav>
  );
}
