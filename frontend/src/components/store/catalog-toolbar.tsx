"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Percent, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildCatalogHref,
  DEFAULT_FILTERS,
  hasActiveFilters,
  type CatalogFilters,
  type CatalogSort,
} from "@/lib/catalog-filters";

interface CatalogToolbarProps {
  filters: CatalogFilters;
  /** Listing root, e.g. "/categories/jeans" or "/search". */
  basePath: string;
  /** Search term preserved on the search page. */
  search?: string;
}

/** Sort + price filters; every change rewrites the URL (dropping `page`) so
 *  the server page re-renders with filtered results. */
export function CatalogToolbar({ filters, basePath, search }: CatalogToolbarProps) {
  const router = useRouter();
  const [min, setMin] = useState(filters.min ?? "");
  const [max, setMax] = useState(filters.max ?? "");

  // The URL is the source of truth; adjust state during render (not in an
  // effect) when it changes underneath us - React's recommended pattern.
  const bounds = `${filters.min ?? ""}|${filters.max ?? ""}`;
  const [seenBounds, setSeenBounds] = useState(bounds);
  if (seenBounds !== bounds) {
    setSeenBounds(bounds);
    setMin(filters.min ?? "");
    setMax(filters.max ?? "");
  }

  const go = (next: Partial<CatalogFilters>) =>
    router.push(
      buildCatalogHref(basePath, { ...filters, ...next }, { q: search }),
    );

  const applyPrice = (event: FormEvent) => {
    event.preventDefault();
    go({ min: min.trim() || undefined, max: max.trim() || undefined });
  };

  const reset = () => go({ ...DEFAULT_FILTERS });

  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      <Select
        value={filters.sort}
        onValueChange={(value) => go({ sort: value as CatalogSort })}
      >
        <SelectTrigger className="h-9 w-[190px] text-xs" aria-label="Sort products">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="newest">Newest first</SelectItem>
          <SelectItem value="price_asc">Price: low to high</SelectItem>
          <SelectItem value="price_desc">Price: high to low</SelectItem>
          <SelectItem value="title">Name: A to Z</SelectItem>
        </SelectContent>
      </Select>

      <form onSubmit={applyPrice} className="flex items-center gap-1.5">
        <Input
          type="number"
          min={0}
          inputMode="numeric"
          value={min}
          onChange={(event) => setMin(event.target.value)}
          placeholder="Min"
          aria-label="Minimum price in Ksh"
          className="h-9 w-[4.5rem] text-xs"
        />
        <span aria-hidden="true" className="text-muted-foreground">
          -
        </span>
        <Input
          type="number"
          min={0}
          inputMode="numeric"
          value={max}
          onChange={(event) => setMax(event.target.value)}
          placeholder="Max"
          aria-label="Maximum price in Ksh"
          className="h-9 w-[4.5rem] text-xs"
        />
        <Button type="submit" variant="outline" size="sm" className="h-9 text-xs">
          Apply
        </Button>
      </form>

      <Button
        type="button"
        variant={filters.sale ? "default" : "outline"}
        size="sm"
        className="h-9 gap-1 text-xs"
        aria-pressed={filters.sale}
        onClick={() => go({ sale: !filters.sale })}
      >
        <Percent className="size-3.5" aria-hidden="true" />
        On sale
      </Button>

      {hasActiveFilters(filters) && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 gap-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={reset}
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          Reset
        </Button>
      )}
    </div>
  );
}
