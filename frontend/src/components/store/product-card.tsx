import Link from "next/link";
import {
  Check,
  Heart,
  Image as ImageIcon,
  MessageCircle,
  ShoppingBag,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useStore } from "@/components/store/store-context";
import { mediaUrl } from "@/lib/media";
import { formatKsh, productWhatsappLink, type StoreProduct } from "@/lib/store";

interface ProductCardProps {
  product: StoreProduct;
  adding: boolean;
  /** True while this product sits in the guest cart (shows "In Cart"). */
  inCart: boolean;
  onAdd: (product: StoreProduct) => void;
  /** Opens the cart sheet - bound to the "In Cart" button. */
  onOpenCart: () => void;
}

export function ProductCard({
  product,
  adding,
  inCart,
  onAdd,
  onOpenCart,
}: ProductCardProps) {
  const { wishlist, toggleWishlist } = useStore();
  const wishlisted = wishlist.has(product.id);
  const image = product.primary_image ? mediaUrl(product.primary_image) : null;

  return (
    <article
      id={`product-${product.id}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-(--shadow-card) transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-(--shadow-card-hover)"
    >
      {/* Portrait 3:4 preview - matches how the catalog photos are shot */}
      <Link
        href={`/products/${product.slug}`}
        className="relative block aspect-[3/4] w-full overflow-hidden bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        {image ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={image}
            alt={product.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageIcon
              className="size-8 text-muted-foreground/60"
              aria-hidden="true"
            />
          </div>
        )}

        {product.is_on_sale && (
          <Badge className="absolute top-2 left-2">Sale</Badge>
        )}

        {!product.is_in_stock && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Badge variant="destructive">Out of stock</Badge>
          </div>
        )}
      </Link>

      {/* Wishlist toggle - sits above the image link, never navigates */}
      <button
        type="button"
        aria-label={
          wishlisted
            ? `Remove ${product.title} from wishlist`
            : `Save ${product.title} to wishlist`
        }
        aria-pressed={wishlisted}
        onClick={() => toggleWishlist(product)}
        className="absolute top-2 right-2 z-10 flex size-9 items-center justify-center rounded-full border bg-background/85 text-muted-foreground backdrop-blur transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Heart
          className={wishlisted ? "size-4 fill-primary text-primary" : "size-4"}
        />
      </button>

      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium" title={product.title}>
            <Link
              href={`/products/${product.slug}`}
              className="rounded-sm outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {product.title}
            </Link>
          </h3>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-sm font-semibold tabular-nums text-primary">
              Ksh {formatKsh(product.current_price)}
            </span>
            {product.is_on_sale && (
              <span className="text-xs text-muted-foreground line-through tabular-nums">
                Ksh {formatKsh(product.base_price)}
              </span>
            )}
          </p>
        </div>

        {/* Stacked actions keep both labels readable at every grid width */}
        <div className="mt-auto flex flex-col gap-2">
          <Button variant="outline" className="w-full gap-1.5" asChild>
            <a
              href={productWhatsappLink(product)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle className="size-4" />
              WhatsApp
            </a>
          </Button>
          {product.sizes.length > 0 ? (
            // Sized products route to the detail page to pick size/quantity
            // first.
            <Button className="w-full gap-1.5" asChild>
              <Link href={`/products/${product.slug}`}>
                <ShoppingBag className="size-4" />
                Select size
              </Link>
            </Button>
          ) : (
            <Button
              className="w-full gap-1.5"
              disabled={adding || (!inCart && !product.is_in_stock)}
              onClick={() => (inCart ? onOpenCart() : onAdd(product))}
            >
              {inCart ? (
                <Check className="size-4" />
              ) : (
                <ShoppingBag className="size-4" />
              )}
              {adding
                ? "Adding…"
                : inCart
                  ? "In Cart"
                  : product.is_in_stock
                    ? "Add to Cart"
                    : "Sold out"}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
