import { Storefront } from "@/components/store/storefront";
import { api } from "@/lib/api";
import type { Category, Paginated } from "@/lib/types";
import type { StoreProduct, StorefrontCatalog } from "@/lib/store";

export const revalidate = 60;

async function getInitialCatalog(): Promise<StorefrontCatalog | null> {
  try {
    const [categoriesRes, productsRes] = await Promise.all([
      api.get<Paginated<Category>>("/api/v1/catalog/categories/?page_size=100"),
      api.get<Paginated<StoreProduct>>("/api/v1/catalog/products/?page_size=100"),
    ]);
    return {
      categories: categoriesRes.results,
      products: productsRes.results,
    };
  } catch {
    return null;
  }
}

export default async function StorePage() {
  const initialCatalog = await getInitialCatalog();
  return <Storefront initialCatalog={initialCatalog} />;
}
