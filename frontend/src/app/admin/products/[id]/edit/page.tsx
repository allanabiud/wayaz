"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductForm } from "@/components/admin/product-form";
import { EmptyState, ErrorState } from "@/components/admin/states";
import { api } from "@/lib/api";
import { useQuery } from "@/lib/use-query";
import type { Category, Paginated, Product } from "@/lib/types";

export default function EditProductPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);

  const {
    data: product,
    error,
    loading,
    refetch,
  } = useQuery<Product>(
    () => api.get<Product>(`/api/v1/admin/products/${id}/`),
    [id],
  );
  const { data: categories } = useQuery<Category[]>(async () => {
    const res = await api.get<Paginated<Category>>("/api/v1/admin/categories/");
    return res.results;
  });

  if (!Number.isFinite(id)) {
    return (
      <div className="space-y-5">
        <EmptyState
          title="Product not found"
          hint="That product link isn't valid."
          action={
            <Button variant="outline" asChild>
              <Link href="/admin/products">
                <ArrowLeft className="mr-1.5 size-4" />
                Back to Products
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (loading && !product) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-4 w-28" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Skeleton className="h-56 rounded-xl" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-44 rounded-xl" />
            <Skeleton className="h-36 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="space-y-5">
        <Link
          href="/admin/products"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Products
        </Link>
        <ErrorState message={error ?? "Product not found."} onRetry={refetch} />
        <div className="flex justify-center">
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/products">Back to Products</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ProductForm
      categories={categories ?? []}
      product={product}
      onImagesChanged={refetch}
    />
  );
}
