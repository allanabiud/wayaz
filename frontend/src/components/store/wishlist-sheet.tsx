import Link from "next/link";
import { Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EmptyState } from "@/components/admin/states";
import { mediaUrl } from "@/lib/media";
import { formatKsh, type StoreProduct } from "@/lib/store";

interface WishlistSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Wishlisted products resolved against the shared catalog. */
  products: StoreProduct[];
  /** Raw wishlist count - non-zero while the catalog is still loading. */
  total: number;
  /** Adds/removes a wishlisted item (supplied by the store provider). */
  onToggle: (product: { id: number; title: string }) => void;
}

export function WishlistSheet({
  open,
  onOpenChange,
  products,
  total,
  onToggle,
}: WishlistSheetProps) {

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0">
        <SheetHeader className="border-b">
          <SheetTitle>Wishlisted</SheetTitle>
          <SheetDescription className="sr-only">
            Saved items tied to your account.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {products.length === 0 ? (
            total > 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Loading your wishlist…
              </p>
            ) : (
              <EmptyState
                title="Nothing wishlisted yet"
                hint="Tap the heart on any product to save it here."
              />
            )
          ) : (
            <ul className="space-y-3">
              {products.map((product) => {
                const image = product.primary_image
                  ? mediaUrl(product.primary_image)
                  : null;

                return (
                  <li
                    key={product.id}
                    className="flex gap-3 rounded-xl border bg-card p-2"
                  >
                    <Link
                      href={`/products/${product.slug}`}
                      onClick={() => onOpenChange(false)}
                      className="h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {image ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={image}
                          alt={product.title}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </Link>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-medium">
                          <Link
                            href={`/products/${product.slug}`}
                            onClick={() => onOpenChange(false)}
                            className="rounded-sm outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                          >
                            {product.title}
                          </Link>
                        </p>
                        <button
                          type="button"
                          aria-label={`Remove ${product.title} from wishlist`}
                          onClick={() => onToggle(product)}
                          className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>

                      <p className="mt-0.5 flex items-baseline gap-1.5 text-xs text-muted-foreground tabular-nums">
                        <span className="text-sm font-semibold text-foreground">
                          Ksh {formatKsh(product.current_price)}
                        </span>
                        {product.is_on_sale && (
                          <span className="line-through">
                            Ksh {formatKsh(product.base_price)}
                          </span>
                        )}
                      </p>

                      {!product.is_in_stock && (
                        <p className="mt-1 text-xs font-medium text-destructive">
                          Out of stock
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
