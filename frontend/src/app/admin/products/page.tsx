"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, Plus, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListPagination } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { FilterSearch, FilterToolbar } from "@/components/admin/filter-toolbar";
import { api } from "@/lib/api";
import { useQuery } from "@/lib/use-query";
import type { Category, Paginated, Product } from "@/lib/types";

const ALL = "__all__";
const PAGE_SIZE = 10;

function money(value: string | number): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-KE") : String(value);
}

function ProductsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [category, setCategory] = useState(ALL);
  const [page, setPage] = useState(1);
  const [inStock, setInStock] = useState(
    () => searchParams.get("in_stock") || ALL,
  );

  const { data: categories } = useQuery<Category[]>(async () => {
    const res = await api.get<Paginated<Category>>("/api/v1/admin/categories/");
    return res.results;
  });

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (appliedSearch) params.set("search", appliedSearch);
    if (category !== ALL) params.set("category", category);
    if (inStock !== ALL) params.set("in_stock", inStock);
    params.set("page", String(page));
    params.set("page_size", String(PAGE_SIZE));
    return params.toString();
  }, [appliedSearch, category, inStock, page]);

  const { data, error, loading, refetch } = useQuery<Paginated<Product>>(
    () => api.get<Paginated<Product>>(`/api/v1/admin/products/?${query}`),
    [query],
  );

  const products = data?.results ?? [];

  const applyFilter = (setter: (v: string) => void) => (value: string) => { setter(value); setPage(1); };
  const submitSearch = () => { setAppliedSearch(search.trim()); setPage(1); };
  const openCreate = () => router.push("/admin/products/new");
  const openProduct = (prod: Product) => router.push(`/admin/products/${prod.id}`);

  const filtersActive = Boolean(appliedSearch) || category !== ALL || inStock !== ALL;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.25em] text-gold">
            Catalog
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data ? `${data.count.toLocaleString()} products in catalog` : "Manage products and inventory"}
          </p>
        </div>
        <Button onClick={openCreate} className="gap-1.5 shadow-sm cursor-pointer">
          <Plus className="size-4" />Add Product
        </Button>
      </div>

      <FilterToolbar
        search={
          <FilterSearch
            value={search}
            onValueChange={setSearch}
            onSubmit={submitSearch}
            onClear={() => { setSearch(""); setAppliedSearch(""); setPage(1); }}
            placeholder="Search products by title or category…"
          />
        }
        filters={
          <>
            <Select value={category} onValueChange={applyFilter(setCategory)}>
              <SelectTrigger className="w-[145px] h-9 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All categories</SelectItem>
                {categories?.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={inStock} onValueChange={applyFilter(setInStock)}>
              <SelectTrigger className="w-[130px] h-9 text-xs"><SelectValue placeholder="Stock status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any stock</SelectItem>
                <SelectItem value="true">In stock</SelectItem>
                <SelectItem value="false">Out of stock</SelectItem>
              </SelectContent>
            </Select>

            {filtersActive && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => { setSearch(""); setAppliedSearch(""); setCategory(ALL); setInStock(ALL); setPage(1); }}
              >
                Reset filters
              </Button>
            )}
          </>
        }
      />

      {error && <ErrorState message={error} onRetry={refetch} />}

      {loading && !data && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      )}

      {!loading && data && products.length === 0 && (
        <EmptyState
          title={filtersActive ? "No products match those filters" : "Catalog is empty"}
          hint={filtersActive ? "Try resetting your search query or filters." : "Add your first product to start populating your catalog."}
          action={filtersActive ? undefined : (
            <Button onClick={openCreate} className="gap-2"><Plus className="size-4" />Add Product</Button>
          )}
        />
      )}

      {products.length > 0 && (
        <>
          {/* Mobile: card list; the table is unusable on small screens. */}
          <div className="space-y-3 md:hidden">
            {products.map((product) => {
              const isZero = !product.is_in_stock || product.stock_quantity <= 0;
              const isLow = !isZero && product.stock_quantity <= 5;

              return (
                <div
                  key={product.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openProduct(product)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openProduct(product);
                    }
                  }}
                  className="cursor-pointer rounded-2xl bg-card p-4 shadow-(--shadow-card) transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
                        <span className="truncate">{product.title}</span>
                        {product.is_featured && (
                          <>
                            <Star
                              className="size-3.5 shrink-0 fill-gold text-gold"
                              aria-hidden
                            />
                            <span className="sr-only">Featured</span>
                          </>
                        )}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {product.category_name || "Uncategorized"}
                      </p>
                    </div>
                    <Badge
                      variant={isZero ? "destructive" : isLow ? "warning" : "secondary"}
                      className="shrink-0 text-xs font-semibold tabular-nums"
                    >
                      {isZero ? "Out of stock" : `${product.stock_quantity} units`}
                    </Badge>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-3">
                    <span
                      className={`text-sm font-semibold tabular-nums ${product.sale_price ? "text-primary" : "text-foreground"}`}
                    >
                      Ksh {money(product.sale_price ?? product.base_price)}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Eye className="size-3.5" />
                      View
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden rounded-2xl bg-card shadow-(--shadow-card) overflow-hidden md:block">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="w-[36%] font-semibold text-xs">Name</TableHead>
                  <TableHead className="w-[20%] font-semibold text-xs">Category</TableHead>
                  <TableHead className="w-[16%] font-semibold text-xs">Price</TableHead>
                  <TableHead className="w-[14%] font-semibold text-xs">Stock</TableHead>
                  <TableHead className="w-[14%] text-right font-semibold text-xs">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => {
                  const isZero = !product.is_in_stock || product.stock_quantity <= 0;
                  const isLow = !isZero && product.stock_quantity <= 5;

                  return (
                    <TableRow
                      key={product.id}
                      className="cursor-pointer transition-colors hover:bg-muted/50"
                      onClick={() => openProduct(product)}
                    >
                      <TableCell className="truncate">
                        <div className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
                          <span className="truncate">{product.title}</span>
                          {product.is_featured && (
                            <>
                              <Star
                                className="size-3.5 shrink-0 fill-gold text-gold"
                                aria-hidden
                              />
                              <span className="sr-only">Featured</span>
                            </>
                          )}
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          /{product.slug}
                        </div>
                      </TableCell>

                      <TableCell className="truncate text-xs text-muted-foreground">
                        {product.category_name || "Uncategorized"}
                      </TableCell>

                      <TableCell className="truncate text-sm font-semibold tabular-nums">
                        <span className={product.sale_price ? "text-primary" : "text-foreground"}>
                          Ksh {money(product.sale_price ?? product.base_price)}
                        </span>
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant={isZero ? "destructive" : isLow ? "warning" : "secondary"}
                          className="text-xs font-semibold tabular-nums"
                        >
                          {isZero ? "Out of stock" : `${product.stock_quantity} units`}
                        </Badge>
                      </TableCell>

                      <TableCell
                        className="text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                          onClick={() => openProduct(product)}
                        >
                          <Eye className="size-3.5" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <ListPagination
            page={page}
            count={data?.count ?? 0}
            pageSize={PAGE_SIZE}
            itemCount={products.length}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-muted-foreground">Loading products…</div>}>
      <ProductsContent />
    </Suspense>
  );
}
