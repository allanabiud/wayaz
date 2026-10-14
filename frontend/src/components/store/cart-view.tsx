"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WhatsAppIcon as WhatsAppGlyph } from "@/components/brand-icons";
import { EmptyState } from "@/components/ui/states";
import { CartLine } from "@/components/store/cart-line";
import { useStore } from "@/lib/store-context";
import { cartWhatsappLink, formatKsh } from "@/lib/store-api";

export function CartView() {
  const { cart, updateCart, settings } = useStore();
  const items = cart?.items ?? [];
  const unsized = items.find(
    (item) => item.product.sizes.length > 0 && !item.size,
  );

  if (!cart || items.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <EmptyState
          title="Your cart is empty"
          hint="Add pieces from our collection and they'll show up here."
        />
        <div className="mt-6">
          <Button asChild>
            <Link href="/">Browse Collection</Link>
          </Button>
        </div>
      </div>
    );
  }

  const checkoutButton = unsized ? (
    <Button size="lg" className="gap-1.5" disabled>
      Checkout
    </Button>
  ) : (
    <Button size="lg" className="gap-1.5" asChild>
      <Link href="/checkout">
        Checkout
        <ChevronRight className="size-4" />
      </Link>
    </Button>
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          Store
        </Link>
        <ChevronRight className="size-4" />
        <span className="font-medium text-foreground">Cart</span>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your cart</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {cart.total_items} {cart.total_items === 1 ? "item" : "items"} ·
            saved on this device, no account needed.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/">Continue shopping</Link>
        </Button>
      </div>

      <ul className="mt-6 space-y-3">
        {items.map((item) => (
          <CartLine key={item.id} item={item} onCartChange={updateCart} />
        ))}
      </ul>

      <div className="mt-6 rounded-2xl border bg-card p-4 shadow-(--shadow-card)">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="text-base font-semibold tabular-nums">
            Ksh {formatKsh(cart.subtotal)}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Delivery fee is calculated at checkout.
        </p>

        {unsized && (
          <p className="mt-3 text-xs font-medium text-amber-600">
            Choose a size for {unsized.product.product_title} before checking
            out.
          </p>
        )}

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button variant="outline" size="lg" className="gap-1.5" asChild>
            <a
              href={cartWhatsappLink(cart, settings?.whatsapp_number)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <WhatsAppGlyph className="size-4" />
              Order on WhatsApp
            </a>
          </Button>
          {checkoutButton}
        </div>
      </div>
    </div>
  );
}
