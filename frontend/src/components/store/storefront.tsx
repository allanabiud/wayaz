"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/admin/states";
import { ProductCard } from "@/components/store/product-card";
import { useStore } from "@/components/store/store-context";
import type { StoreProduct, StorefrontCatalog } from "@/lib/store";

interface Section {
  key: string;
  name: string;
  products: StoreProduct[];
}

/** Default section size: 3 rows × 4 columns on the desktop grid. */
const SECTION_VISIBLE = 12;

/** Groups products under their category (in display order), leftovers last.
    Categories without products never produce a section. */
function buildSections(catalog: StorefrontCatalog): Section[] {
  const bySlug = new Map<string, StoreProduct[]>();
  for (const product of catalog.products) {
    const key = product.category_slug || "uncategorized";
    const bucket = bySlug.get(key);
    if (bucket) {
      bucket.push(product);
    } else {
      bySlug.set(key, [product]);
    }
  }

  const sections: Section[] = [];
  const claimed = new Set<string>();
  for (const category of catalog.categories) {
    const products = bySlug.get(category.slug);
    if (products && products.length > 0) {
      claimed.add(category.slug);
      sections.push({ key: category.slug, name: category.name, products });
    }
  }

  // Products whose category is missing or unknown still get a home.
  const leftovers: StoreProduct[] = [];
  for (const [key, products] of bySlug) {
    if (!claimed.has(key)) {
      leftovers.push(...products);
    }
  }
  if (leftovers.length > 0) {
    sections.push({ key: "more", name: "More to explore", products: leftovers });
  }

  return sections;
}

function CatalogSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton className="mb-4 h-5 w-40" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="overflow-hidden rounded-2xl border">
            <Skeleton className="aspect-[3/4] w-full rounded-none" />
            <div className="space-y-2 p-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** One of the top shelves (Featured / New Arrivals) - capped at 8 cards. */
function TopShelf({
  eyebrow,
  title,
  products,
}: {
  eyebrow: string;
  title: string;
  products: StoreProduct[];
}) {
  const { addingId, addProduct, cartProductIds, openCart } = useStore();
  if (products.length === 0) return null;

  return (
    <section className="mb-10">
      <div className="mb-4">
        <p className="text-xs font-semibold tracking-[0.25em] text-gold uppercase">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight uppercase">
          {title}
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            adding={addingId === product.id}
            inCart={cartProductIds.has(product.id)}
            onAdd={(item) => void addProduct(item)}
            onOpenCart={openCart}
          />
        ))}
      </div>
    </section>
  );
}

/** Home page content: brand banner + one section per category. */
export function Storefront() {
  const {
    catalog,
    catalogLoading,
    catalogError,
    refetchCatalog,
    addingId,
    addProduct,
    cartProductIds,
    openCart,
  } = useStore();
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

  const sections = useMemo(
    () => (catalog ? buildSections(catalog) : []),
    [catalog],
  );

  // Top shelves: admin-curated Featured + automatic New Arrivals, max 8 each.
  const featured = useMemo(
    () =>
      catalog
        ? catalog.products.filter((product) => product.is_featured).slice(0, 8)
        : [],
    [catalog],
  );
  const newArrivals = useMemo(() => {
    if (!catalog) return [];
    return [...catalog.products]
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      .slice(0, 8);
  }, [catalog]);

  // Banner links: only categories that actually have items to show; empty
  // categories and the leftover "more" bucket get no button.
  const categorySections = sections.filter((section) => section.key !== "more");

  const toggleSection = (key: string) => {
    setExpandedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  return (
    <>
      {/* Slim brand banner with direct links to every category page */}
      <section className="border-b bg-muted/30">
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
          <p className="text-xs font-semibold tracking-[0.25em] text-gold uppercase">
            Wayaz Collection
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Shop the collection.
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Fresh fits delivered across Kenya - order on WhatsApp or add
            pieces to your cart.
          </p>

          {catalogLoading && !catalog ? (
            <div className="mt-5 flex flex-wrap gap-2" aria-hidden="true">
              <Skeleton className="h-10 w-28" />
              <Skeleton className="h-10 w-28" />
            </div>
          ) : categorySections.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {categorySections.map((section) => (
                <Button key={section.key} size="lg" className="gap-1.5" asChild>
                  <Link href={`/categories/${section.key}`}>
                    {section.name}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {/* One section per category, cards for every product */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        {catalogLoading && !catalog && <CatalogSkeleton />}
        {catalogError && (
          <ErrorState message={catalogError} onRetry={refetchCatalog} />
        )}

        {/* Admin-curated + automatic shelves at the top of the home page */}
        <TopShelf eyebrow="Handpicked" title="Featured" products={featured} />
        <TopShelf eyebrow="Just in" title="New Arrivals" products={newArrivals} />

        {catalog && sections.length === 0 && (
          <EmptyState
            title="Nothing in stock yet"
            hint="New pieces will appear here as soon as the team adds them."
            action={
              <Button variant="outline" size="sm" onClick={refetchCatalog}>
                Refresh
              </Button>
            }
          />
        )}

        {sections.map((section) => {
          const expanded = expandedKeys.includes(section.key);
          // Real category sections link to their dedicated paginated page;
          // the leftover bucket ("more"/"uncategorized") has no page.
          const sectionHref =
            section.key !== "more" && section.key !== "uncategorized"
              ? `/categories/${section.key}`
              : null;
          const visible = expanded
            ? section.products
            : section.products.slice(0, SECTION_VISIBLE);
          const hiddenCount = section.products.length - visible.length;

          return (
            <section key={section.key} className="mb-10 last:mb-0">
              <div className="mb-4 flex items-baseline justify-between gap-4">
                <h2 className="text-lg font-semibold tracking-tight uppercase">
                  {sectionHref ? (
                    <Link
                      href={sectionHref}
                      className="rounded-sm outline-none transition-colors hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {section.name}
                    </Link>
                  ) : (
                    section.name
                  )}
                </h2>
                <span className="flex items-baseline gap-3 text-xs text-muted-foreground">
                  <span className="tabular-nums">
                    {section.products.length}{" "}
                    {section.products.length === 1 ? "item" : "items"}
                  </span>
                  {sectionHref && (
                    <Link
                      href={sectionHref}
                      className="font-medium text-foreground transition-colors hover:text-primary"
                    >
                      View all →
                    </Link>
                  )}
                </span>
              </div>

              {/* 2 columns on mobile, 4 from tablet up */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {visible.map((product) => (
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

              {section.products.length > SECTION_VISIBLE && (
                <div className="mt-4 flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleSection(section.key)}
                  >
                    {expanded ? "Show less" : `Show ${hiddenCount} more`}
                  </Button>
                </div>
              )}
            </section>
          );
        })}
      </main>
    </>
  );
}
