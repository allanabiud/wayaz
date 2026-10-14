import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/brand-icons";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/states";
import { CartLine } from "@/components/store/cart-line";
import { cartWhatsappLink, formatKsh, type Cart } from "@/lib/store-api";
import { useStore } from "@/lib/store-context";

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
  const { settings } = useStore();
  const items = cart?.items ?? [];
  // A sized line without a size blocks checkout until the picker is used.
  const unsized = items.find(
    (item) => item.product.sizes.length > 0 && !item.size,
  );

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
              {items.map((item) => (
                <CartLine key={item.id} item={item} onCartChange={onCartChange} />
              ))}
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

            {unsized && (
              <p className="text-xs font-medium text-amber-600">
                Choose a size for {unsized.product.product_title} before
                checking out.
              </p>
            )}

            <Button
              variant="outline"
              className="w-full gap-1.5"
              asChild
              onClick={() => onOpenChange(false)}
            >
              <Link href="/cart">
                <ShoppingCart className="size-4" />
                View cart
              </Link>
            </Button>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="gap-1.5" asChild>
                <a
                  href={cartWhatsappLink(cart, settings?.whatsapp_number)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <WhatsAppIcon className="size-4" />
                  WhatsApp
                </a>
              </Button>
              {unsized ? (
                <Button className="gap-1.5" disabled>
                  Checkout
                </Button>
              ) : (
                <Button
                  className="gap-1.5"
                  asChild
                  onClick={() => onOpenChange(false)}
                >
                  <Link href="/checkout">Checkout</Link>
                </Button>
              )}
            </div>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
