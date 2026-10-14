// Sort/price filter state for storefront listings, kept in the URL so results
// stay server-rendered and shareable. Any change drops `page`.

const CATALOG_SORTS = ["newest", "price_asc", "price_desc", "title"] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

export interface CatalogFilters {
  sort: CatalogSort;
  min?: string;
  max?: string;
  sale: boolean;
}

// min/max spelled out so spreading over live filters clears them.
export const DEFAULT_FILTERS: CatalogFilters = {
  sort: "newest",
  min: undefined,
  max: undefined,
  sale: false,
};

const first = (value?: string | string[]): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const priceParam = (value?: string | string[]): string | undefined => {
  const raw = first(value);
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? String(parsed) : undefined;
};

export function parseCatalogFilters(
  searchParams: Record<string, string | string[] | undefined>,
): CatalogFilters {
  const sort = first(searchParams.sort);
  const sale = first(searchParams.sale);
  return {
    sort: CATALOG_SORTS.includes(sort as CatalogSort)
      ? (sort as CatalogSort)
      : "newest",
    min: priceParam(searchParams.min),
    max: priceParam(searchParams.max),
    sale: sale === "1" || sale === "true",
  };
}

export function hasActiveFilters(filters: CatalogFilters): boolean {
  return (
    filters.sort !== "newest" || Boolean(filters.min || filters.max) || filters.sale
  );
}

export function toProductQuery(filters: CatalogFilters): string {
  const params = new URLSearchParams();
  // "newest" is the backend default, so omit it.
  if (filters.sort !== "newest") params.set("ordering", filters.sort);
  if (filters.min) params.set("min_price", filters.min);
  if (filters.max) params.set("max_price", filters.max);
  if (filters.sale) params.set("sale", "true");
  return params.toString();
}

export function buildCatalogHref(
  basePath: string,
  filters: CatalogFilters,
  extra: { q?: string; page?: number } = {},
): string {
  const params = new URLSearchParams();
  if (extra.q) params.set("q", extra.q);
  if (filters.sort !== "newest") params.set("sort", filters.sort);
  if (filters.min) params.set("min", filters.min);
  if (filters.max) params.set("max", filters.max);
  if (filters.sale) params.set("sale", "1");
  if (extra.page && extra.page > 1) params.set("page", String(extra.page));
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}
