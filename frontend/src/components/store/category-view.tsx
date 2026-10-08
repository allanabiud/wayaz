"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/admin/states";
import { PaginationBar } from "@/components/store/pagination-bar";
import { ProductCard } from "@/components/store/product-card";
import { useStore } from "@/components/store/store-context";
import type { StoreProduct } from "@/lib/store";
import type { Category } from "@/lib/types";

interface CategoryViewProps {
  category: Category;
  products: StoreProduct[];
  /** Total items across every page. */
  count: number;
  page: number;
  pages: number;
}

function pageHref(slug: string, page: number): string {
  return page <= 1 ? `/categories/${slug}` : `/categories/${slug}?page=${page}`;
}

/** Dedicated category listing: breadcrumb, header, grid, pagination. */
export function CategoryView({
  category,
  products,
  count,
  page,
  pages,
}: CategoryViewProps) {
  const { addingId, addProduct, cartProductIds, openCart } = useStore();

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        <Link
          href="/"
          className="rounded-sm outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Home
        </Link>
        <ChevronRight className="size-3.5" aria-hidden="true" />
        <span className="font-medium text-foreground">{category.name}</span>
      </nav>

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-gold uppercase">
            Category
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            {category.name}
          </h1>
        </div>
        <p className="text-sm text-muted-foreground tabular-nums">
          {count} {count === 1 ? "item" : "items"}
          {pages > 1 && ` · Page ${page} of ${pages}`}
        </p>
      </div>

      {category.description && (
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {category.description}
        </p>
      )}

      {products.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="Nothing here yet"
            hint={`New ${category.name.toLowerCase()} pieces will appear here soon - meanwhile, browse the full collection.`}
            action={
              <Button variant="outline" size="sm" asChild>
                <Link href="/">Browse the collection</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              adding={addingId === product.id}
              inCart={cartProductIds.has(product.id)}
              onAdd={(p) => void addProduct(p)}
              onOpenCart={openCart}
            />
          ))}
        </div>
      )}

      <PaginationBar
        page={page}
        pages={pages}
        hrefFor={(target) => pageHref(category.slug, target)}
      />
    </main>
  );
}
