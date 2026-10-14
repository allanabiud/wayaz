"use client";

import { useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { mediaUrl } from "@/lib/media";
import {
  formatKsh,
  removeCartItem,
  setCartItemSize,
  updateCartItem,
  type Cart,
  type CartLine as CartLineItem,
} from "@/lib/store-api";

export function CartLine({
  item,
  onCartChange,
}: {
  item: CartLineItem;
  onCartChange: (cart: Cart) => void;
}) {
  const [busy, setBusy] = useState(false);
  const product = item.product;
  const thumbnail = product.thumbnail ? mediaUrl(product.thumbnail) : null;
  const hasSizes = product.sizes.length > 0;
  const needsSize = hasSizes && !item.size;

  const run = async (action: () => Promise<Cart>, failure: string) => {
    if (busy) return;
    setBusy(true);
    try {
      onCartChange(await action());
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : failure);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex gap-3 rounded-xl border bg-card p-3">
      <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
        {thumbnail && (
          <Image
            src={thumbnail}
            alt={product.product_title}
            fill
            sizes="56px"
            loading="eager"
            className="object-cover"
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-medium">
            {product.product_title}
          </p>
          <button
            type="button"
            aria-label={`Remove ${product.product_title} from cart`}
            disabled={busy}
            onClick={() =>
              run(() => removeCartItem(item.id), "Could not remove item.")
            }
            className="shrink-0 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>

        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
          Ksh {formatKsh(item.unit_price)} each
        </p>

        {hasSizes && (
          <div className="mt-2">
            <span className="text-xs font-medium text-muted-foreground">
              Size
            </span>
            <div
              className="mt-1 flex flex-wrap gap-1.5"
              role="group"
              aria-label={`Size for ${product.product_title}`}
            >
              {product.sizes.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={item.size === option}
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => setCartItemSize(item.id, option),
                      "Could not update size.",
                    )
                  }
                  className={`h-8 min-w-9 rounded-lg border px-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 ${
                    item.size === option
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-accent"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
            {needsSize && (
              <p className="mt-1 text-xs font-medium text-amber-600">
                Choose a size to check out.
              </p>
            )}
          </div>
        )}

        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center rounded-lg border">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Decrease quantity"
              disabled={busy || item.quantity <= 1}
              onClick={() =>
                run(
                  () => updateCartItem(item.id, item.quantity - 1),
                  "Could not update quantity.",
                )
              }
            >
              <Minus />
            </Button>
            <span className="w-6 text-center text-xs font-medium tabular-nums">
              {item.quantity}
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Increase quantity"
              disabled={busy}
              onClick={() =>
                run(
                  () => updateCartItem(item.id, item.quantity + 1),
                  "Could not update quantity.",
                )
              }
            >
              <Plus />
            </Button>
          </div>

          <span className="text-sm font-semibold tabular-nums">
            Ksh {formatKsh(item.line_total)}
          </span>
        </div>
      </div>
    </li>
  );
}
