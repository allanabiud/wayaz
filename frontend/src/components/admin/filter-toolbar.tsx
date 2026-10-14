import type { ReactNode } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Shared toolbar above the admin list tables (products, orders, payments,
 * reviews, messages).
 *
 * Layout contract: the search field sits on the left with the filter
 * selects immediately after it, and `trailing` (result-count badges and
 * the like) is pushed to the far right. Every admin table uses this so
 * the toolbars stay aligned with each other.
 */
export function FilterToolbar({
  search,
  filters,
  trailing,
}: {
  /** The `FilterSearch` field (or any search control). */
  search: ReactNode;
  /** Filter selects rendered left, right next to the search field. */
  filters?: ReactNode;
  /** Right-aligned extras: count badges, export buttons, … */
  trailing?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {search}
      {filters}
      {trailing && (
        <div className="ml-auto flex items-center gap-2">{trailing}</div>
      )}
    </div>
  );
}

/**
 * The search input every admin toolbar shares: leading icon, clear button
 * and a capped width.
 *
 * Two query styles exist and both are supported here:
 * - search-as-you-type: pass `onValueChange` only (optionally `onClear`
 *   when clearing must also reset pagination);
 * - apply-on-submit: also pass `onSubmit`, which fires on Enter and blur.
 */
export function FilterSearch({
  value,
  onValueChange,
  placeholder,
  onSubmit,
  onClear,
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  /** Apply the query on Enter/blur. Omit for search-as-you-type pages. */
  onSubmit?: () => void;
  /** Clear-button handler; defaults to resetting the value to "". */
  onClear?: () => void;
}) {
  const handleClear = () => {
    if (onClear) onClear();
    else onValueChange("");
  };

  const field = (
    <>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onBlur={onSubmit}
        placeholder={placeholder}
        className="pl-9 pr-8 h-9 text-xs"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={handleClear}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </>
  );

  const className = "relative min-w-[200px] flex-1 sm:max-w-xs";

  if (!onSubmit) {
    return <div className={className}>{field}</div>;
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className={className}
    >
      {field}
    </form>
  );
}
