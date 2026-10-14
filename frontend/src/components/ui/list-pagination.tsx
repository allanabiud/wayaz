import { Button } from "@/components/ui/button";

interface ListPaginationProps {
  /** 1-based page currently shown. */
  page: number;
  /** Total rows across every page. */
  count: number;
  /** Rows per page. */
  pageSize: number;
  /** Rows actually on the current page (the "x-y" range end). */
  itemCount: number;
  onPageChange: (page: number) => void;
  className?: string;
}

/**
 * Footer for every paginated list: "Showing 1-10 of 34" on the left and
 * Previous / 1/4 / Next on the right. Shared so the admin tables and the
 * storefront review list page through the exact same controls; renders
 * nothing when there is nothing to page through.
 */
export function ListPagination({
  page,
  count,
  pageSize,
  itemCount,
  onPageChange,
  className,
}: ListPaginationProps) {
  if (count <= 0) return null;
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const start = (page - 1) * pageSize + 1;
  const end = start + itemCount - 1;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 pt-2 ${className ?? ""}`}
    >
      <p className="text-xs text-muted-foreground tabular-nums">
        Showing {start}-{end} of {count.toLocaleString()}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="h-8 text-xs cursor-pointer"
        >
          Previous
        </Button>
        <span className="min-w-10 text-center text-xs font-medium text-muted-foreground tabular-nums">
          {page}/{totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="h-8 text-xs cursor-pointer"
        >
          Next
        </Button>
      </div>
    </div>
  );
}
