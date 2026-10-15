"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, ShoppingBag, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useStore } from "@/lib/store-context";
import { api } from "@/lib/api";
import {
  formatKsh,
  type StoreProduct,
  type StoreProductDetail,
} from "@/lib/store-api";

/** Ceiling while the real stock count is still loading. */
const FALLBACK_MAX_QTY = 10;

/** Quick size picker for a product card; sized products need it because
 *  the card itself can't hold a size selector. */
export function QuickBuyDialog({
  product,
  open,
  onOpenChange,
  mode = "buy",
}: {
  product: StoreProduct;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "add" keeps the shopper on the grid, "buy" continues to /checkout. */
  mode?: "add" | "buy";
}) {
  const router = useRouter();
  const { addProduct } = useStore();
  const [size, setSize] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<StoreProductDetail | null>(null);

  // The grid payload has no stock count, only the detail endpoint does;
  // clamp the stepper to the picked size's units (the server re-validates).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api
      .get<StoreProductDetail>(
        `/api/v1/catalog/products/${encodeURIComponent(product.slug)}/`,
      )
      .then((res) => {
        if (!cancelled) setDetail(res);
      })
      .catch(() => {
        // Keep the fallback cap; the add call still validates server-side.
      });
    return () => {
      cancelled = true;
    };
  }, [open, product.slug]);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setSize("");
      setQuantity(1);
      setDetail(null);
    }
    onOpenChange(next);
  };

  const availableFor = (option: string) =>
    detail?.size_stock.find((row) => row.size === option)?.quantity ?? 0;
  // One-size products report the total; sized ones follow the chosen size.
  const stockLeft = size
    ? availableFor(size)
    : (detail?.stock_quantity ?? null);
  const maxQuantity =
    stockLeft === null ? FALLBACK_MAX_QTY : Math.max(1, stockLeft);
  const lineTotal = Number(product.current_price) * quantity;
  const canBuy = Boolean(size) && product.is_in_stock && !busy;

  const handleConfirm = async () => {
    if (!canBuy) return;
    setBusy(true);
    try {
      const added = await addProduct(product, { quantity, size });
      if (added) {
        onOpenChange(false);
        if (mode === "buy") router.push("/checkout");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="pr-8">{product.title}</DialogTitle>
          <DialogDescription className="text-xs">
            {mode === "buy"
              ? "Pick your size - you'll go straight to checkout."
              : "Pick your size - it goes straight into your cart."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-lg font-bold tabular-nums text-primary">
              Ksh {formatKsh(product.current_price)}
            </span>
            {product.is_on_sale && (
              <span className="text-sm text-muted-foreground line-through tabular-nums">
                Ksh {formatKsh(product.base_price)}
              </span>
            )}
          </p>

          <div>
            <span className="text-sm font-medium">Size</span>
            <div
              className="mt-2 flex flex-wrap gap-2"
              role="group"
              aria-label="Select a size"
            >
              {product.sizes.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={size === option}
                  disabled={busy}
                  onClick={() => {
                    setSize(option);
                    // A smaller size must not keep a bigger quantity.
                    setQuantity((prev) =>
                      Math.max(1, Math.min(prev, availableFor(option))),
                    );
                  }}
                  className={`h-10 min-w-11 rounded-lg border px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 ${
                    size === option
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-accent"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Quantity</span>
            <div className="flex items-center rounded-lg border">
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Decrease quantity"
                disabled={busy || quantity <= 1}
                onClick={() => setQuantity((prev) => Math.max(1, prev - 1))}
              >
                <Minus />
              </Button>
              <span className="w-8 text-center text-sm font-medium tabular-nums">
                {quantity}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Increase quantity"
                disabled={busy || quantity >= maxQuantity}
                onClick={() =>
                  setQuantity((prev) => Math.min(maxQuantity, prev + 1))
                }
              >
                <Plus />
              </Button>
            </div>
          </div>

          {stockLeft !== null && stockLeft <= 5 && (
            <p className="text-xs font-medium text-amber-600">
              Only {stockLeft} left{size ? ` in size ${size}` : ""}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            size="lg"
            className="w-full gap-2 sm:w-auto"
            disabled={!canBuy}
            onClick={() => void handleConfirm()}
          >
            {mode === "buy" ? (
              <Zap className="size-4" />
            ) : (
              <ShoppingBag className="size-4" />
            )}
            {busy
              ? "Adding…"
              : mode === "buy"
                ? `Buy now · Ksh ${formatKsh(lineTotal)}`
                : `Add to cart · Ksh ${formatKsh(lineTotal)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
