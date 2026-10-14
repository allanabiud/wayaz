/**
 * Sort/price filter state for the storefront listings.
 *
 * Shared by both sides of the listing pages: the server pages read it from
 * `searchParams` to query the API, and the toolbar (client) uses it to rewrite
 * the URL. Keeping filters in the URL means results stay server-rendered,
 * shareable and friendly to the back button. Any change drops `page` so a
 * narrower result set always starts at page 1.
 */

const CATALOG_SORTS = ["newest", "price_asc", "price_desc", "title"] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

export interface CatalogFilters {
  /** "newest" is the default listing order. */
  sort: CatalogSort;
  /** Price bounds as raw query-string values (validated on parse). */
  min?: string;
  max?: string;
  sale: boolean;
}

/** What an unfiltered listing looks like - handy for building reset URLs.
 *  `min`/`max` are spelled out so spreading over live filters clears them. */
export const DEFAULT_FILTERS: CatalogFilters = {
  sort: "newest",
  min: undefined,
  max: undefined,
  sale: false,
};

const first = (value?: string | string[]): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/** Keeps only finite, non-negative numbers; anything else reads as "unset". */
const priceParam = (value?: string | string[]): string | undefined => {
  const raw = first(value);
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? String(parsed) : undefined;
};

/** Sanitise whatever arrived in the query string into a filters object. */
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

/** True when anything deviates from the unfiltered listing. */
export function hasActiveFilters(filters: CatalogFilters): boolean {
  return (
    filters.sort !== "newest" || Boolean(filters.min || filters.max) || filters.sale
  );
}

/** Query string the products API understands for these filters. */
export function toProductQuery(filters: CatalogFilters): string {
  const params = new URLSearchParams();
  // "newest" matches the backend default, so only speak up when we differ.
  if (filters.sort !== "newest") params.set("ordering", filters.sort);
  if (filters.min) params.set("min_price", filters.min);
  if (filters.max) params.set("max_price", filters.max);
  if (filters.sale) params.set("sale", "true");
  return params.toString();
}

/**
 * Page URL for a filtered listing. `page` is omitted unless explicitly asked
 * for, so applying a filter always lands back on page 1.
 */
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
