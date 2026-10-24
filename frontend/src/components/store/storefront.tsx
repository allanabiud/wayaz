"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { ProductCard } from "@/components/store/product-card";
import { CategoryIcon } from "@/components/store/category-icon";
import { useStore } from "@/lib/store-context";
import { type StoreProduct, type StorefrontCatalog } from "@/lib/store-api";

interface Section {
  key: string;
  name: string;
  icon: string | null;
  products: StoreProduct[];
}

const SECTION_VISIBLE = 12;

/** Groups products under their category (display order); leftovers last.
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
      sections.push({
        key: category.slug,
        name: category.name,
        icon: category.icon,
        products,
      });
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
    sections.push({
      key: "more",
      name: "More to explore",
      icon: null,
      products: leftovers,
    });
  }

  return sections;
}

function CatalogSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton className="mb-4 h-5 w-40" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 md:grid-cols-4">
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

function TopShelf({
  eyebrow,
  title,
  products,
}: {
  eyebrow: string;
  title: string;
  products: StoreProduct[];
}) {
  const { addingId, addProduct, cartProductIds } = useStore();
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
      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 md:grid-cols-4">
        {products.map((product, index) => (
          <ProductCard
            key={product.id}
            product={product}
            adding={addingId === product.id}
            inCart={cartProductIds.has(product.id)}
            eager={index < 4}
            onAdd={(item) => void addProduct(item)}
          />
        ))}
      </div>
    </section>
  );
}

interface StorefrontProps {
  initialCatalog?: StorefrontCatalog | null;
}

export function Storefront({ initialCatalog }: StorefrontProps) {
  const {
    catalog: contextCatalog,
    catalogLoading,
    catalogError,
    refetchCatalog,
    addingId,
    addProduct,
    cartProductIds,
    settings,
  } = useStore();
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

  // Prefer the context catalog once loaded; fall back to the SSR catalog.
  const catalog = contextCatalog ?? initialCatalog ?? null;

  const sections = useMemo(
    () => (catalog ? buildSections(catalog) : []),
    [catalog],
  );

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

  // Banner links only for categories with items; empty and leftover
  // buckets get no chip.
  const categorySections = sections.filter((section) => section.key !== "more");

  const toggleSection = (key: string) => {
    setExpandedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  return (
    <>
      <section className="border-b bg-muted/20">
        <div className="mx-auto w-full max-w-7xl px-4 py-3 sm:px-6 sm:py-4">
          {/* Mobile: stacked. sm+: side-by-side */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-6">
            {/* Title + tagline */}
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
              <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
                Shop the collection
              </h1>
              <p className="text-sm text-muted-foreground">
                {settings?.tagline || "Fresh fits across Kenya"}
              </p>
            </div>

            {/* Category buttons */}
            {catalogLoading && !catalog ? (
              <div
                className="flex gap-2 overflow-x-auto pb-0.5"
                aria-hidden="true"
              >
                <Skeleton className="h-11 w-24 shrink-0 rounded-md" />
                <Skeleton className="h-11 w-24 shrink-0 rounded-md" />
                <Skeleton className="h-11 w-24 shrink-0 rounded-md" />
              </div>
            ) : categorySections.length > 0 ? (
              <nav
                aria-label="Categories"
                className="flex gap-2 overflow-x-auto pb-0.5 sm:flex-wrap sm:items-stretch sm:overflow-visible sm:pb-0"
              >
                {categorySections.map((section) => (
                  <Link
                    key={section.key}
                    href={`/categories/${section.key}`}
                    className="group inline-flex shrink-0 items-center gap-2.5 rounded-md bg-primary px-4 py-3 text-base font-semibold uppercase tracking-wide text-primary-foreground shadow-sm transition-all duration-150 hover:bg-primary/90 active:scale-[0.98] sm:shrink sm:py-3.5"
                  >
                    <CategoryIcon
                      name={section.icon}
                      className="size-5 opacity-90"
                    />
                    <span>{section.name}</span>
                    <ArrowRight className="size-4 opacity-70 transition-transform duration-150 group-hover:translate-x-0.5" />
                  </Link>
                ))}
              </nav>
            ) : null}
          </div>
        </div>
      </section>

      <main className="mx-auto w-full max-w-7xl flex-1 px-3.5 py-6 sm:px-6 sm:py-8">
        {catalogLoading && !catalog && <CatalogSkeleton />}
        {catalogError && !catalog && (
          <ErrorState message={catalogError} onRetry={refetchCatalog} />
        )}

        <TopShelf eyebrow="Handpicked" title="Featured" products={featured} />
        <TopShelf
          eyebrow="Just in"
          title="New Arrivals"
          products={newArrivals}
        />

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
          // Real categories link to their paginated page; the leftover
          // bucket has none.
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
              <div className="mb-4 flex items-center justify-between gap-4">
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
                {sectionHref && (
                  <Button size="sm" className="group shrink-0 gap-1.5" asChild>
                    <Link href={sectionHref}>
                      <span>View all</span>
                      <ArrowRight className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
                    </Link>
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 md:grid-cols-4">
                {visible.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    adding={addingId === product.id}
                    inCart={cartProductIds.has(product.id)}
                    onAdd={(p) => void addProduct(p)}
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
