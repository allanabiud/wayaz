import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { SearchResults } from "@/components/store/search-results";
import type { StoreProduct } from "@/lib/store";
import type { Paginated } from "@/lib/types";

const PAGE_SIZE = 20;

interface PageProps {
  searchParams: Promise<{ q?: string; page?: string }>;
}

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  if (!query) return { title: "Search" };

  return {
    title: `Search: ${query}`,
    description: `Search the Wayaz Collection for ${query}. Order on WhatsApp or add pieces to your cart.`,
    // Near-duplicate of the main listings - keep it out of the index.
    robots: { index: false },
  };
}

export default async function SearchPage({ searchParams }: PageProps) {
  const { q, page: pageParam } = await searchParams;
  const query = (q ?? "").trim();

  const page = Number(pageParam ?? "1");
  if (!Number.isInteger(page) || page < 1) notFound();

  if (!query) {
    return (
      <SearchResults query="" products={[]} count={0} page={1} pages={1} />
    );
  }

  let listing: Paginated<StoreProduct>;
  try {
    listing = await api.get<Paginated<StoreProduct>>(
      `/api/v1/catalog/products/?search=${encodeURIComponent(query)}&page_size=${PAGE_SIZE}&page=${page}`,
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
      query={query}
      products={listing.results}
      count={listing.count}
      page={page}
      pages={pages}
    />
  );
}
