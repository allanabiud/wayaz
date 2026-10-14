import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  BellRing,
  Check,
  Heart,
  Image as ImageIcon,
  ShoppingBag,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/brand-icons";
import { useStore } from "@/components/store/store-context";
import { QuickBuyDialog } from "@/components/store/quick-buy-dialog";
import { RestockDialog } from "@/components/store/restock-dialog";
import { mediaUrl } from "@/lib/media";
import { formatKsh, productWhatsappLink, type StoreProduct } from "@/lib/store";
import { cn } from "@/lib/utils";

interface ProductCardProps {
  product: StoreProduct;
  adding: boolean;
  /** True while this product sits in the guest cart (shows "In Cart"). */
  inCart: boolean;
  /**
   * Loads the image eagerly instead of lazily - set it for cards above the
   * fold so the LCP image isn't delayed by IntersectionObserver. (Next 16
   * deprecated `priority`; `loading="eager"` is the replacement.)
   */
  eager?: boolean;
  onAdd: (product: StoreProduct) => void;
}

export function ProductCard({
  product,
  adding,
  inCart,
  eager = false,
  onAdd,
}: ProductCardProps) {
  const { wishlist, toggleWishlist, settings, addProduct, bumpProduct, bumpingId } =
    useStore();
  const router = useRouter();
  const wishlisted = wishlist.has(product.id);
  const image = product.primary_image ? mediaUrl(product.primary_image) : null;

  // Both CTAs share the quick picker for sized pieces: "add" keeps the
  // shopper on the grid, "buy" continues to /checkout.
  const [buying, setBuying] = useState(false);
  const [quickBuyOpen, setQuickBuyOpen] = useState(false);
  const [quickMode, setQuickMode] = useState<"add" | "buy">("buy");
  const [notifyOpen, setNotifyOpen] = useState(false);
  const bumping = bumpingId === product.id;

  const openQuickBuy = (mode: "add" | "buy") => {
    setQuickMode(mode);
    setQuickBuyOpen(true);
  };

  // "In Cart" doubles as a quantity bump; one-size pieces add straight from
  // the card, sized pieces need the picker to choose a size first.
  const handleAdd = () => {
    if (inCart) {
      void bumpProduct(product);
      return;
    }
    if (product.sizes.length > 0) {
      openQuickBuy("add");
      return;
    }
    onAdd(product);
  };

  // Sold-out pieces can't be bought, so both CTAs collapse into the notify
  // flow rather than sitting there greyed out.
  const handleBuyNow = () => {
    if (!product.is_in_stock) {
      setNotifyOpen(true);
      return;
    }
    if (product.sizes.length > 0) {
      openQuickBuy("buy");
      return;
    }
    void (async () => {
      setBuying(true);
      try {
        if (!inCart && !(await addProduct(product))) return;
        router.push("/checkout");
      } finally {
        setBuying(false);
      }
    })();
  };

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
          <Image
            src={image}
            alt={product.title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            loading={eager ? "eager" : "lazy"}
            className="object-cover transition-transform duration-300 group-hover:scale-105"
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
        className="absolute top-2 right-2 z-10 flex size-9 items-center justify-center rounded-full border bg-card/85 text-muted-foreground backdrop-blur transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Heart
          className={wishlisted ? "size-4 fill-primary text-primary" : "size-4"}
        />
      </button>

      {/* WhatsApp - icon-only on the photo so every card keeps the same
          two-row action block no matter which buttons it has */}
      <a
        href={productWhatsappLink(product, settings?.whatsapp_number)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Order ${product.title} on WhatsApp`}
        title="Order on WhatsApp"
        className="absolute top-13 right-2 z-10 flex size-9 items-center justify-center rounded-full border bg-card/85 text-emerald-600 backdrop-blur transition-colors outline-none hover:text-emerald-700 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <WhatsAppIcon className="size-4" />
      </a>

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

        {/* Sold-out pieces trade the whole action block for one full-width
            notify button - the block is swapped, not just its buttons, so a
            grid row keeps the same height either way. */}
        {!product.is_in_stock ? (
          <Button
            variant="outline"
            className={cn(
              "mt-auto w-full gap-1.5",
              "restock-button",
            )}
            onClick={() => setNotifyOpen(true)}
          >
            <BellRing className="size-4" />
            Notify on restock
          </Button>
        ) : (
          /* Buy now then Add to Cart in one block: stacked on phones (Add to
             Cart at the bottom) and side by side from xl (Add to Cart on the
             right), where cards are wide enough for two labelled buttons.
             Every card renders both - sized or not - so a grid row stays an
             even height. */
          <div className="mt-auto flex flex-col gap-2 xl:flex-row">
            <Button
              variant="secondary"
              className="w-full gap-1.5 xl:min-w-0 xl:flex-1"
              disabled={buying || bumping}
              onClick={handleBuyNow}
            >
              <Zap className="size-4" />
              {buying ? "Adding…" : "Buy now"}
            </Button>
            <Button
              className="w-full gap-1.5 xl:min-w-0 xl:flex-1"
              disabled={adding || bumping}
              onClick={handleAdd}
            >
              {inCart ? (
                <Check className="size-4" />
              ) : (
                <ShoppingBag className="size-4" />
              )}
              {adding || bumping
                ? "Adding…"
                : inCart
                  ? "In Cart"
                  : "Add to Cart"}
            </Button>
          </div>
        )}
      </div>

      <RestockDialog
        product={product}
        open={notifyOpen}
        onOpenChange={setNotifyOpen}
      />

      <QuickBuyDialog
        product={product}
        open={quickBuyOpen}
        onOpenChange={setQuickBuyOpen}
        mode={quickMode}
      />
    </article>
  );
}
