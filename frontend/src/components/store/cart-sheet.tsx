import { useState } from "react";
import { toast } from "sonner";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EmptyState } from "@/components/admin/states";
import { ApiError } from "@/lib/api";
import { mediaUrl } from "@/lib/media";
import {
  cartWhatsappLink,
  formatKsh,
  removeCartItem,
  updateCartItem,
  type Cart,
} from "@/lib/store";

interface CartSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cart: Cart | null;
  onCartChange: (cart: Cart) => void;
}

export function CartSheet({
  open,
  onOpenChange,
  cart,
  onCartChange,
}: CartSheetProps) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const items = cart?.items ?? [];

  const run = async (
    itemId: number,
    action: () => Promise<Cart>,
    failure: string,
  ) => {
    if (busyId !== null) return;
    setBusyId(itemId);
    try {
      onCartChange(await action());
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : failure);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0">
        <SheetHeader className="border-b">
          <SheetTitle>Your cart</SheetTitle>
          <SheetDescription className="sr-only">
            Saved on this device - no account needed.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {items.length === 0 ? (
            <EmptyState
              title="Your cart is empty"
              hint="Add pieces from the collection to see them here."
            />
          ) : (
            <ul className="space-y-3">
              {items.map((item) => {
                const thumbnail = item.product.thumbnail
                  ? mediaUrl(item.product.thumbnail)
                  : null;
                const busy = busyId === item.id;

                return (
                  <li
                    key={item.id}
                    className="flex gap-3 rounded-xl border bg-card p-2"
                  >
                    <div className="h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {thumbnail && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={thumbnail}
                          alt={item.product.product_title}
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-medium">
                          {item.product.product_title}
                        </p>
                        <button
                          type="button"
                          aria-label={`Remove ${item.product.product_title}`}
                          disabled={busy}
                          onClick={() =>
                            run(
                              item.id,
                              () => removeCartItem(item.id),
                              "Could not remove item.",
                            )
                          }
                          className="shrink-0 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>

                      <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                        {item.size ? `Size ${item.size} · ` : ""}Ksh{" "}
                        {formatKsh(item.unit_price)} each
                      </p>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="flex items-center rounded-lg border">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Decrease quantity"
                            disabled={busy || item.quantity <= 1}
                            onClick={() =>
                              run(
                                item.id,
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
                                item.id,
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
              })}
            </ul>
          )}
        </div>

        {cart && items.length > 0 && (
          <SheetFooter className="border-t">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-semibold tabular-nums">
                Ksh {formatKsh(cart.subtotal)}
              </span>
            </div>

            <div className="flex flex-col gap-2 sm:grid sm:grid-cols-2">
              <Button variant="outline" className="gap-1.5" asChild>
                <a
                  href={cartWhatsappLink(cart)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Order on WhatsApp
                </a>
              </Button>
              <Button className="gap-1.5" disabled>
                Checkout
              </Button>
            </div>
            <p className="text-center text-[11px] text-muted-foreground">
              Checkout coming soon - M-Pesa and cash on delivery.
            </p>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
