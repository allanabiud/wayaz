"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Edit, Images, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/admin/states";
import { ImageManagerDialog } from "@/components/admin/image-manager-dialog";
import { api, ApiError } from "@/lib/api";
import { mediaUrl } from "@/lib/media";
import { useQuery } from "@/lib/use-query";
import type { Product } from "@/lib/types";

function money(value: string | number): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-KE") : String(value);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
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

  const [imagesOpen, setImagesOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (deleting || !product) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(`/api/v1/admin/products/${product.id}/`);
      router.push("/admin/products");
    } catch (err) {
      setDeleteError(
        err instanceof ApiError ? err.message : "Could not delete this product.",
      );
      setDeleting(false);
    }
  };

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
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-80 max-w-full" />
            <Skeleton className="h-4 w-56" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-2xl" />
          <div className="space-y-4">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-40 rounded-2xl" />
            <Skeleton className="h-72 rounded-2xl" />
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

  const primaryImage =
    product.images.find((img) => img.is_primary) ?? product.images[0];
  const hasSale = Boolean(product.sale_price);
  const stock = product.stock_quantity;
  const isZero = !product.is_in_stock || stock <= 0;
  const isLow = !isZero && stock <= 5;

  return (
    <div className="space-y-5">
      {/* Back link */}
      <Link
        href="/admin/products"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Products
      </Link>

      {/* Header: title + Edit / Delete */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.25em] text-gold">
            Catalog
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {product.title}
            </h1>
            {product.is_featured && (
              <Badge className="bg-gold text-black">Featured</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {product.category_name || "Uncategorized"}
            <span className="ml-1.5 font-mono text-xs">/{product.slug}</span>
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <Button variant="outline" className="gap-1.5 cursor-pointer" asChild>
            <Link href={`/admin/products/${product.id}/edit`}>
              <Edit className="size-4" />
              Edit
            </Link>
          </Button>
          <Button
            variant="outline"
            className="gap-1.5 text-destructive hover:text-destructive hover:border-destructive/30 cursor-pointer"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="size-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Overview */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Image - first column, full-bleed inside its card. The invisible
            3:4 sizer sets the row height when the image side is tallest;
            the image absolutely fills the card edge to edge (no gutter),
            clipped by the card's rounded corners. */}
        <Card className="relative p-0">
          <div className="aspect-[3/4] w-full" aria-hidden="true" />
          {primaryImage ? (
            <div className="absolute inset-0 overflow-hidden bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mediaUrl(primaryImage.image)}
                alt={product.title}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
              No primary image uploaded
            </div>
          )}
        </Card>

        {/* At-a-glance cards + Description + Details - second column,
            stretches so its bottom edge lands level with the image */}
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent>
                <span className="text-[11px] text-muted-foreground">Units</span>
                <p className="mt-0.5 text-lg font-bold tabular-nums">{stock}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <span className="text-[11px] text-muted-foreground">Photos</span>
                <p className="mt-0.5 text-lg font-bold tabular-nums">
                  {product.images.length}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <span className="text-[11px] text-muted-foreground">Status</span>
                <p className="mt-1">
                  <Badge
                    variant={isZero ? "destructive" : isLow ? "warning" : "secondary"}
                    className="text-xs font-semibold tabular-nums"
                  >
                    {isZero
                      ? "Out of stock"
                      : isLow
                        ? "Low stock"
                        : "In stock"}
                  </Badge>
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-foreground/90 whitespace-pre-line leading-relaxed">
                {product.description || "No description provided."}
              </p>
            </CardContent>
          </Card>

          {/* Details - grows to match the image height */}
          <Card className="flex-1">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                <div>
                  <dt className="text-muted-foreground">Price</dt>
                  <dd className="mt-0.5 text-sm font-semibold text-foreground tabular-nums">
                    Ksh {money(product.sale_price ?? product.base_price)}
                    {hasSale && (
                      <span className="ml-1.5 text-[11px] font-normal text-muted-foreground line-through">
                        Ksh {money(product.base_price)}
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Category</dt>
                  <dd className="font-medium text-foreground mt-0.5">
                    {product.category_name || "Uncategorized"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Sizes</dt>
                  <dd className="font-medium text-foreground mt-0.5">
                    {product.sizes.length > 0
                      ? product.sizes.join(", ")
                      : "One size"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Slug</dt>
                  <dd className="font-mono text-foreground mt-0.5">
                    /{product.slug}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Created</dt>
                  <dd className="text-foreground mt-0.5">
                    {formatDate(product.created_at)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Last updated</dt>
                  <dd className="text-foreground mt-0.5">
                    {formatDate(product.updated_at)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Photos */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold">Photos</CardTitle>
            <p className="text-xs text-muted-foreground">
              {product.images.length} photo{product.images.length === 1 ? "" : "s"} uploaded
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs cursor-pointer"
            onClick={() => setImagesOpen(true)}
          >
            <Images className="size-3.5" />
            Manage Photos
          </Button>
        </CardHeader>
        <CardContent>
          {product.images.length === 0 ? (
            <EmptyState
              title="No images uploaded"
              hint="Add photos so customers can see this item."
              action={
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => setImagesOpen(true)}
                >
                  Upload Images
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {product.images.map((img) => (
                <div
                  key={img.id}
                  className="group relative aspect-[3/4] overflow-hidden rounded-lg border bg-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mediaUrl(img.image)}
                    alt={img.alt_text || product.title}
                    className="h-full w-full object-cover"
                  />
                  {img.is_primary && (
                    <Badge className="absolute top-1.5 left-1.5 text-[10px] bg-primary text-primary-foreground">
                      Primary
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Images Manager Dialog */}
      <ImageManagerDialog
        open={imagesOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setImagesOpen(false);
            refetch();
          }
        }}
        productId={product.id}
        productTitle={product.title}
      />

      {/* Delete confirmation */}
      <Dialog
        open={confirmDelete}
        onOpenChange={(isOpen) => {
          if (!isOpen && !deleting) {
            setConfirmDelete(false);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Product</DialogTitle>
            <DialogDescription>
              Delete &ldquo;{product.title}&rdquo;? Its photos will be removed
              too. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p role="alert" className="text-xs text-destructive">
              {deleteError}
            </p>
          )}
          <DialogFooter className="mt-4 gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setConfirmDelete(false);
                setDeleteError(null);
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
