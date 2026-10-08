"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/admin/states";
import { PaginationBar } from "@/components/store/pagination-bar";
import { ProductCard } from "@/components/store/product-card";
import { useStore } from "@/components/store/store-context";
import { rememberSearch, type StoreProduct } from "@/lib/store";

interface SearchResultsProps {
  query: string;
  products: StoreProduct[];
  /** Total hits across every page. */
  count: number;
  page: number;
  pages: number;
}

function searchHref(query: string, page: number): string {
  const base = `/search?q=${encodeURIComponent(query)}`;
  return page <= 1 ? base : `${base}&page=${page}`;
}

/** Dedicated results page: breadcrumb, gold header, grid, pagination. */
export function SearchResults({
  query,
  products,
  count,
  page,
  pages,
}: SearchResultsProps) {
  const { addingId, addProduct, cartProductIds, openCart } = useStore();

  // Keep this device's recent searches in sync even for direct visits.
  useEffect(() => {
    if (query) rememberSearch(query);
  }, [query]);

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
        <span className="font-medium text-foreground">Search</span>
      </nav>

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-gold uppercase">
            Search
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            {query ? (
              <>
                Results for <span className="break-words">“{query}”</span>
              </>
            ) : (
              "Search the collection"
            )}
          </h1>
        </div>
        {query && (
          <p className="text-sm text-muted-foreground tabular-nums">
            {count} {count === 1 ? "result" : "results"}
            {pages > 1 && ` · Page ${page} of ${pages}`}
          </p>
        )}
      </div>

      {!query ? (
        <div className="mt-8">
          <EmptyState
            title="What are you looking for?"
            hint="Type a product, colour or category in the search bar above - or browse the full collection."
            action={
              <Button variant="outline" size="sm" asChild>
                <Link href="/">Browse the collection</Link>
              </Button>
            }
          />
        </div>
      ) : count === 0 ? (
        <div className="mt-8">
          <EmptyState
            title={`No results for “${query}”`}
            hint="Try another word, or browse everything we have in stock."
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

      {query && (
        <PaginationBar
          page={page}
          pages={pages}
          hrefFor={(target) => searchHref(query, target)}
        />
      )}
    </main>
  );
}
