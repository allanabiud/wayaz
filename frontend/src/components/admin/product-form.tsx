"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ImagePlus,
  Images,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ImageManagerDialog } from "@/components/admin/image-manager-dialog";
import { api, ApiError } from "@/lib/api";
import { mediaUrl } from "@/lib/media";
import type { Category, Product, ProductPayload, SizeStock } from "@/lib/types";

interface PendingImage {
  key: string;
  file: File;
  preview: string;
}

/** Inventory row while editing; quantity stays a string until submit. */
interface SizeRow {
  size: string;
  quantity: string;
}

const MAX_FILE_MB = 5;

interface Props {
  categories: Category[];
  /** null = create mode */
  product: Product | null;
  onImagesChanged?: () => void;
}

export function ProductForm({ categories, product, onImagesChanged }: Props) {
  const router = useRouter();
  const isEdit = Boolean(product);
  const backHref = product
    ? `/admin/products/${product.id}`
    : "/admin/products";

  const [title, setTitle] = useState(product?.title ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [categoryId, setCategoryId] = useState(
    product?.category_id ? String(product.category_id) : "",
  );
  const [basePrice, setBasePrice] = useState(product?.base_price ?? "");
  const [salePrice, setSalePrice] = useState(product?.sale_price ?? "");
  const [sizeStock, setSizeStock] = useState<SizeRow[]>(
    (product?.size_stock ?? []).map((row) => ({
      size: row.size,
      quantity: String(row.quantity),
    })),
  );
  const [isFeatured, setIsFeatured] = useState(product?.is_featured ?? false);

  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [dragging, setDragging] = useState(false);
  const [imagesOpen, setImagesOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const categoryRequired = categories.length > 0;

  const addFiles = (files: FileList | File[]): void => {
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    const oversize = images.find((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    if (oversize) {
      setError(`"${oversize.name}" exceeds ${MAX_FILE_MB}MB.`);
      return;
    }
    setPendingImages((prev) => [
      ...prev,
      ...images.map((file) => ({
        key: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
      })),
    ]);
  };

  const removePending = (key: string) =>
    setPendingImages((prev) => {
      const target = prev.find((p) => p.key === key);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((p) => p.key !== key);
    });

  const updateRow = (index: number, patch: Partial<SizeRow>) =>
    setSizeStock((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;

    if (categoryRequired && !categoryId) {
      return setError("Choose a category.");
    }
    if (!title.trim()) {
      return setError("Title is required.");
    }
    const bp = Number(basePrice);
    if (!basePrice.trim() || !Number.isFinite(bp) || bp < 0) {
      return setError("Enter a valid base price.");
    }
    if (
      salePrice.trim() !== "" &&
      (!Number.isFinite(Number(salePrice)) || Number(salePrice) < 0)
    ) {
      return setError("Sale price must be a valid number.");
    }

    const sizeRows: SizeStock[] = [];
    const seen = new Set<string>();
    for (const row of sizeStock) {
      const size = row.size.trim();
      if (size.length > 50) {
        return setError("Each size must be 50 characters or fewer.");
      }
      if (seen.has(size)) {
        return setError(`Duplicate size: ${size || "(one-size)"}.`);
      }
      seen.add(size);
      const quantity = Number(row.quantity);
      if (!Number.isInteger(quantity) || quantity < 0) {
        return setError("Stock must be a whole number of 0 or more.");
      }
      sizeRows.push({ size, quantity });
    }
    if (sizeRows.length > 30) {
      return setError("A product can have at most 30 sizes.");
    }
    // A blank size means one-size; it may not share the product with others.
    const blankRows = sizeRows.filter((row) => !row.size);
    if (
      blankRows.length > 1 ||
      (blankRows.length === 1 && sizeRows.length > 1)
    ) {
      return setError(
        "Either a single one-size entry or sized entries, not both.",
      );
    }

    const payload: ProductPayload = {
      title: title.trim(),
      description: description.trim(),
      base_price: basePrice.trim(),
      sale_price: salePrice.trim() === "" ? null : salePrice.trim(),
      category_id: Number(categoryId),
      size_stock: sizeRows,
      is_featured: isFeatured,
    };

    setError(null);
    setSaving(true);
    let productSaved = false;
    try {
      const saved = product
        ? await api.patch<Product>(
            `/api/v1/admin/products/${product.id}/`,
            payload,
          )
        : await api.post<Product>("/api/v1/admin/products/", payload);
      productSaved = true;

      if (pendingImages.length > 0) {
        const hadImages = (saved.images?.length ?? 0) > 0;
        const queue = [...pendingImages];
        for (const [index, pending] of queue.entries()) {
          const form = new FormData();
          form.append("image", pending.file);
          form.append("alt_text", pending.file.name.replace(/\.[^.]+$/, ""));
          form.append(
            "is_primary",
            !hadImages && index === 0 ? "true" : "false",
          );
          await api.upload(
            `/api/v1/admin/products/${saved.id}/upload-image/`,
            form,
          );
          setPendingImages((prev) => prev.filter((p) => p.key !== pending.key));
          URL.revokeObjectURL(pending.preview);
        }
      }

      router.push(`/admin/products/${saved.id}`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Save failed";
      setError(
        productSaved
          ? `Product saved, but an image failed to upload: ${message}. Go back and try again from the product page.`
          : message,
      );
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {product ? product.title : "Products"}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.25em] text-gold">
            Catalog
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isEdit ? "Edit Product" : "Add Product"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isEdit
              ? "Update the details, pricing, stock, and photos for this item."
              : "Fill in the details, stock, and photos for this item."}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => router.push(backHref)}
            className="cursor-pointer"
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving} className="cursor-pointer">
            {saving && (
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
            )}
            {isEdit ? "Save changes" : "Create product"}
          </Button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="p-title">Product Title</Label>
                <Input
                  id="p-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={saving}
                  placeholder="e.g. Vintage Washed Wide-Leg Denim Jeans"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="p-desc">Description</Label>
                <Textarea
                  id="p-desc"
                  rows={5}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={saving}
                  placeholder="Provide a detailed description of material, fit, and style..."
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold">Photos</CardTitle>
              {isEdit && product && product.images.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs cursor-pointer"
                  onClick={() => setImagesOpen(true)}
                  disabled={saving}
                >
                  <Images className="size-3.5" />
                  Manage photos
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {isEdit && product && product.images.length > 0 && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {product.images.map((img) => (
                    <div
                      key={img.id}
                      className="relative aspect-[3/4] overflow-hidden rounded-lg border bg-muted"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={mediaUrl(img.image)}
                        alt={img.alt_text || product.title}
                        className="h-full w-full object-cover"
                      />
                      {img.is_primary && (
                        <span className="absolute top-1 left-1 rounded bg-primary px-1 py-0.5 text-[9px] font-semibold text-primary-foreground">
                          Primary
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  if (e.dataTransfer.files.length)
                    addFiles(e.dataTransfer.files);
                }}
                className={[
                  "space-y-3 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
                  dragging ? "border-primary bg-primary/5" : "border-border",
                ].join(" ")}
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Add photos
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {pendingImages.length === 0
                      ? `Drag images here or browse - JPG, PNG or WebP, up to ${MAX_FILE_MB}MB each`
                      : `${pendingImages.length} selected - uploaded when saved`}
                  </p>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={saving}
                >
                  <ImagePlus className="mr-1.5 size-3.5" aria-hidden />
                  Browse files
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />

                {pendingImages.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {pendingImages.map((p) => (
                      <div
                        key={p.key}
                        className="group relative aspect-[3/4] overflow-hidden rounded-lg border bg-muted"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.preview}
                          alt={p.file.name}
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          aria-label="Remove image"
                          onClick={() => removePending(p.key)}
                          className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                        >
                          <Trash2 className="size-3" aria-hidden />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                Storefront
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="p-featured">Featured product</Label>
                <Switch
                  id="p-featured"
                  checked={isFeatured}
                  onCheckedChange={setIsFeatured}
                  disabled={saving}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Shows this item in the Featured shelf at the top of the
                storefront home. The first 8 featured products appear there.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                Category
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={categoryId}
                onValueChange={setCategoryId}
                disabled={saving}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Pricing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="p-base">Base Price (Ksh)</Label>
                <Input
                  id="p-base"
                  type="number"
                  step="0.01"
                  min="0"
                  value={basePrice}
                  onChange={(e) => setBasePrice(e.target.value)}
                  disabled={saving}
                  placeholder="2500.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-sale">Sale Price (Ksh, optional)</Label>
                <Input
                  id="p-sale"
                  type="number"
                  step="0.01"
                  min="0"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  disabled={saving}
                  placeholder="Leave empty for regular price"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                Inventory
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Label>Sizes &amp; stock</Label>
              {sizeStock.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No rows yet - add one with a blank size for a one-size
                  product.
                </p>
              )}
              {sizeStock.map((row, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    aria-label={`Size ${index + 1}`}
                    value={row.size}
                    onChange={(e) => updateRow(index, { size: e.target.value })}
                    disabled={saving}
                    placeholder="M (blank = one-size)"
                  />
                  <Input
                    aria-label={`Stock for size ${index + 1}`}
                    type="number"
                    step="1"
                    min="0"
                    value={row.quantity}
                    onChange={(e) =>
                      updateRow(index, { quantity: e.target.value })
                    }
                    disabled={saving}
                    className="w-24 shrink-0"
                    placeholder="0"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove size ${index + 1}`}
                    disabled={saving}
                    onClick={() =>
                      setSizeStock((prev) => prev.filter((_, i) => i !== index))
                    }
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs cursor-pointer"
                disabled={saving}
                onClick={() =>
                  setSizeStock((prev) => [...prev, { size: "", quantity: "0" }])
                }
              >
                <Plus className="size-3.5" />
                Add size
              </Button>
              <p className="text-xs text-muted-foreground">
                One row per size - stock is tracked separately for each, and
                shoppers only see sizes that still have units.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {isEdit && product && (
        <ImageManagerDialog
          open={imagesOpen}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setImagesOpen(false);
              onImagesChanged?.();
            }
          }}
          productId={product.id}
          productTitle={product.title}
        />
      )}
    </form>
  );
}
