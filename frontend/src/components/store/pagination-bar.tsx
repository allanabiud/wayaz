import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Page numbers as a gap-aware window: 1 … 4 5 6 … 9 (all when ≤ 7). */
function pageItems(current: number, pages: number): (number | "gap")[] {
  if (pages <= 7) {
    return Array.from({ length: pages }, (_, index) => index + 1);
  }
  const wanted = new Set([1, pages, current - 1, current, current + 1]);
  const sorted = [...wanted]
    .filter((number) => number >= 1 && number <= pages)
    .sort((a, b) => a - b);

  const items: (number | "gap")[] = [];
  let previous = 0;
  for (const number of sorted) {
    if (number - previous > 1) items.push("gap");
    items.push(number);
    previous = number;
  }
  return items;
}

interface PaginationBarProps {
  page: number;
  pages: number;
  /** Link target for a 1-based page (page 1 usually gets a clean URL). */
  hrefFor: (page: number) => string;
}

/** Prev/next plus gap-aware page number buttons, shared by listing pages. */
export function PaginationBar({ page, pages, hrefFor }: PaginationBarProps) {
  if (pages <= 1) return null;

  const base =
    "flex h-10 items-center justify-center rounded-lg border px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50";
  const interactive = "hover:bg-accent";
  const canPrevious = page > 1;
  const canNext = page < pages;

  return (
    <nav
      aria-label="Pagination"
      className="mt-8 flex flex-wrap items-center justify-center gap-1.5"
    >
      {canPrevious ? (
        <Link
          href={hrefFor(page - 1)}
          rel="prev"
          aria-label="Previous page"
          className={`${base} ${interactive} gap-1`}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Prev</span>
        </Link>
      ) : (
        <span
          aria-disabled="true"
          className={`${base} cursor-default text-muted-foreground opacity-50 gap-1`}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Prev</span>
        </span>
      )}

      {pageItems(page, pages).map((item, index) =>
        item === "gap" ? (
          <span
            key={`gap-${index}`}
            className="px-1 text-muted-foreground"
            aria-hidden="true"
          >
            …
          </span>
        ) : (
          <Link
            key={item}
            href={hrefFor(item)}
            aria-current={item === page ? "page" : undefined}
            aria-label={`Page ${item}`}
            className={
              item === page
                ? `${base} border-primary bg-primary text-primary-foreground`
                : `${base} ${interactive}`
            }
          >
            {item}
          </Link>
        ),
      )}

      {canNext ? (
        <Link
          href={hrefFor(page + 1)}
          rel="next"
          aria-label="Next page"
          className={`${base} ${interactive} gap-1`}
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      ) : (
        <span
          aria-disabled="true"
          className={`${base} cursor-default text-muted-foreground opacity-50 gap-1`}
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="size-4" aria-hidden="true" />
        </span>
      )}
    </nav>
  );
}
