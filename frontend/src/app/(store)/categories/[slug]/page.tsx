import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { CategoryView } from "@/components/store/category-view";
import { parseCatalogFilters, toProductQuery } from "@/lib/catalog-filters";
import type { StoreProduct } from "@/lib/store-api";
import type { Category, Paginated } from "@/lib/types";

const PAGE_SIZE = 20;

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Shared by generateMetadata and the page - React cache dedupes the call. */
const fetchCategory = cache(async (slug: string): Promise<Category | null> => {
  try {
    return await api.get<Category>(
      `/api/v1/catalog/categories/${encodeURIComponent(slug)}/`,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
});

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await fetchCategory(slug);
  if (!category) return { title: "Category not found" };

  return {
    title: category.name,
    description:
      category.description ||
      `Shop ${category.name} from the Wayaz Collection. Order on WhatsApp or add pieces to your cart.`,
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: PageProps) {
  const { slug } = await params;
  const query = await searchParams;

  const rawPage = Array.isArray(query.page) ? query.page[0] : query.page;
  const page = Number(rawPage ?? "1");
  if (!Number.isInteger(page) || page < 1) notFound();

  const filters = parseCatalogFilters(query);

  const category = await fetchCategory(slug);
  if (!category) notFound();

  let listing: Paginated<StoreProduct>;
  try {
    const filterQuery = toProductQuery(filters);
    listing = await api.get<Paginated<StoreProduct>>(
      `/api/v1/catalog/products/?category=${encodeURIComponent(slug)}&page_size=${PAGE_SIZE}&page=${page}` +
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
    <CategoryView
      category={category}
      products={listing.results}
      count={listing.count}
      page={page}
      pages={pages}
      filters={filters}
    />
  );
}
