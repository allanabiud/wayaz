"use client";

import { useCallback, useRef, useState } from "react";
import { ImagePlus, Loader2, Star, Trash2, UploadCloud } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/api";
import { mediaUrl } from "@/lib/media";
import { useQuery } from "@/lib/use-query";
import type { Product, ProductImage } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: number | null;
  productTitle: string;
}

const MAX_FILE_MB = 5;

export function ImageManagerDialog({
  open,
  onOpenChange,
  productId,
  productTitle,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, loading, refetch } = useQuery<Product | null>(
    async () => {
      if (!productId || !open) return null;
      return api.get<Product>(`/api/v1/admin/products/${productId}/`);
    },
    [productId, open],
  );

  const images: ProductImage[] = data?.images ?? [];

  const upload = useCallback(
    async (files: FileList | File[]) => {
      if (!productId) return;
      const list = Array.from(files);
      if (!list.length) return;

      const oversize = list.find((f) => f.size > MAX_FILE_MB * 1024 * 1024);
      if (oversize) {
        setError(`"${oversize.name}" exceeds ${MAX_FILE_MB}MB.`);
        return;
      }

      setBusy(true);
      setError(null);
      try {
        for (const file of list) {
          const form = new FormData();
          form.append("image", file);
          form.append("alt_text", file.name.replace(/\.[^.]+$/, ""));
          form.append("is_primary", images.length === 0 ? "true" : "false");
          await api.upload(`/api/v1/admin/products/${productId}/upload-image/`, form);
        }
        refetch();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Upload failed");
      } finally {
        setBusy(false);
      }
    },
    [productId, images.length, refetch],
  );

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length) void upload(event.dataTransfer.files);
  };

  const setPrimary = async (imageId: number) => {
    if (!productId) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(
        `/api/v1/admin/products/${productId}/images/${imageId}/`,
        { is_primary: true },
      );
      refetch();
    } catch {
      setError("Could not set the primary image.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (imageId: number) => {
    if (!productId) return;
    setBusy(true);
    setError(null);
    try {
      await api.delete(
        `/api/v1/admin/products/${productId}/images/${imageId}/`,
      );
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove the image.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Product images</DialogTitle>
          <DialogDescription className="truncate">{productTitle}</DialogDescription>
        </DialogHeader>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={[
            "rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-border",
          ].join(" ")}
        >
          <UploadCloud
            className="mx-auto mb-2 h-7 w-7 text-muted-foreground"
            aria-hidden
          />
          <p className="text-sm font-medium">Drag images here</p>
          <p className="mt-1 text-xs text-muted-foreground">
            JPG, PNG or WebP · up to {MAX_FILE_MB}MB each
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={busy || !productId}
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus className="mr-2 h-4 w-4" aria-hidden />
            Browse files
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void upload(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : images.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            No images yet.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {images.map((image) => (
              <li
                key={image.id}
                className="group relative overflow-hidden rounded-md border"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={mediaUrl(image.image)}
                  alt={image.alt_text || "Product image"}
                  className="aspect-[3/4] w-full object-cover"
                />
                {image.is_primary && (
                  <Badge className="absolute top-1.5 left-1.5" variant="secondary">
                    Primary
                  </Badge>
                )}
                <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/60 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  {!image.is_primary && (
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      className="h-7 w-7"
                      disabled={busy}
                      onClick={() => void setPrimary(image.id)}
                      aria-label="Set as primary"
                    >
                      <Star className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="h-7 w-7 text-destructive"
                    disabled={busy}
                    onClick={() => void remove(image.id)}
                    aria-label="Remove image"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {busy && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            Working…
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
