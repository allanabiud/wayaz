import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { SearchResults } from "@/components/store/search-results";
import { parseCatalogFilters, toProductQuery } from "@/lib/catalog-filters";
import type { StoreProduct } from "@/lib/store";
import type { Paginated } from "@/lib/types";

const PAGE_SIZE = 20;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const rawQ = Array.isArray(params.q) ? params.q[0] : params.q;
  const query = (rawQ ?? "").trim();
  if (!query) return { title: "Search" };

  return {
    title: `Search: ${query}`,
    description: `Search the Wayaz Collection for ${query}. Order on WhatsApp or add pieces to your cart.`,
    // Near-duplicate of the main listings - keep it out of the index.
    robots: { index: false },
  };
}

export default async function SearchPage({ searchParams }: PageProps) {
  const query = await searchParams;

  const rawQ = Array.isArray(query.q) ? query.q[0] : query.q;
  const search = (rawQ ?? "").trim();

  const rawPage = Array.isArray(query.page) ? query.page[0] : query.page;
  const page = Number(rawPage ?? "1");
  if (!Number.isInteger(page) || page < 1) notFound();

  const filters = parseCatalogFilters(query);

  if (!search) {
    return (
      <SearchResults
        query=""
        products={[]}
        count={0}
        page={1}
        pages={1}
        filters={filters}
      />
    );
  }

  let listing: Paginated<StoreProduct>;
  try {
    const filterQuery = toProductQuery(filters);
    listing = await api.get<Paginated<StoreProduct>>(
      `/api/v1/catalog/products/?search=${encodeURIComponent(search)}&page_size=${PAGE_SIZE}&page=${page}` +
        (filterQuery ? `&${filterQuery}` : ""),
    );
  } catch (err) {
    // DRF 404s pages beyond the last one; malformed input is treated alike.
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) {
      notFound();
    }
    throw err;
  }

  const pages = Math.max(1, Math.ceil(listing.count / PAGE_SIZE));

  return (
    <SearchResults
      query={search}
      products={listing.results}
      count={listing.count}
      page={page}
      pages={pages}
      filters={filters}
    />
  );
}
