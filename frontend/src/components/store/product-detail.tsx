"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BellRing,
  Check,
  Heart,
  Image as ImageIcon,
  Minus,
  Plus,
  Share2,
  ShoppingBag,
  Star,
  Zap,
  ZoomIn,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/brand-icons";
import { ProductCard } from "@/components/store/product-card";
import { ProductReviews } from "@/components/store/product-reviews";
import { RestockDialog } from "@/components/store/restock-dialog";
import { useStore } from "@/components/store/store-context";
import { useAuth } from "@/lib/auth-context";
import { mediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";
import {
  fetchProductRating,
  formatKsh,
  productWhatsappLink,
  waLink,
  type ProductRatingSummary,
  type StoreProductDetail,
} from "@/lib/store";

interface ProductDetailProps {
  product: StoreProductDetail;
}

/** Outline star with an amber fill clipped to `fill` (0-1). */
function StarGlyph({ fill }: { fill: number }) {
  return (
    <span className="relative inline-flex" aria-hidden="true">
      <Star className="size-4 text-muted-foreground/50" />
      <span
        className="absolute top-0 left-0 h-full overflow-hidden"
        style={{ width: `${fill * 100}%` }}
      >
        <Star className="size-4 shrink-0 fill-amber-400 text-amber-400" />
      </span>
    </span>
  );
}

export function ProductDetail({ product }: ProductDetailProps) {
  const router = useRouter();
  const {
    catalog,
    cart,
    addingId,
    addProduct,
    cartProductIds,
    openCart,
    wishlist,
    toggleWishlist,
    settings,
  } = useStore();
  const { isAuthenticated } = useAuth();
  const [activeImage, setActiveImage] = useState(0);
  const [size, setSize] = useState("");
  const [quantity, setQuantity] = useState(1);
  // Focal point in % of the frame; non-null doubles as "zoomed".
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const wishlisted = wishlist.has(product.id);

  // SSR only has aggregates; refresh the viewer's own rating once auth is
  // known. The header only ever shows the average.
  const [rating, setRating] = useState<ProductRatingSummary>({
    average_rating: product.average_rating,
    rating_count: product.rating_count,
    user_rating: product.user_rating,
  });

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    fetchProductRating(product.slug)
      .then((summary) => {
        if (!cancelled) setRating(summary);
      })
      .catch(() => {
        // Non-fatal: the SSR aggregates stay on screen.
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, product.slug]);

  // Sticky bar shows once the buy row scrolls past; a 48px dead zone stops
  // flicker, and the footer reserves the bar's height so it's never covered.
  const actionsRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [showStickyBar, setShowStickyBar] = useState(false);

  useEffect(() => {
    const actions = actionsRef.current;
    const bar = barRef.current;
    if (!actions || !bar) return;
    const footer = document.querySelector<HTMLElement>("footer");
    let frame = 0;

    const reserveFooterSpace = () => {
      if (footer) footer.style.paddingBottom = `${bar.offsetHeight}px`;
    };
    reserveFooterSpace();
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(reserveFooterSpace)
        : null;
    observer?.observe(bar);

    const sync = () => {
      frame = 0;
      const card = actions.getBoundingClientRect();
      setShowStickyBar((visible) => {
        if (visible) {
          // Hidden again once the buy row re-enters the viewport.
          return card.bottom <= 0;
        }
        // The 48px gap between the show and hide checks is the dead zone.
        return card.bottom < -48;
      });
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(sync);
    };

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    sync();
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      if (footer) footer.style.paddingBottom = "";
    };
  }, []);

  const setZoomFromEvent = (
    e: MouseEvent<HTMLDivElement> | PointerEvent<HTMLDivElement>,
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setZoom({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  const images = useMemo(
    () =>
      [...product.images].sort(
        (a, b) =>
          Number(b.is_primary) - Number(a.is_primary) ||
          a.display_order - b.display_order,
      ),
    [product.images],
  );
  const current = images[activeImage] ?? null;

  const adding = addingId === product.id;
  const categorySlug = product.category?.slug ?? null;

  // Sized products need an explicit size; one-size products skip straight in.
  const hasSizes = product.sizes.length > 0;
  const sizeChosen = !hasSizes || size !== "";
  const maxQuantity = Math.max(1, product.stock_quantity);
  // Cart state is per product + size: switching size re-offers "Add to
  // Cart" while the selected size shows "In Cart".
  const sizeInCart = (cart?.items ?? []).some(
    (line) => line.product.id === product.id && (line.size || "") === size,
  );

  const related = useMemo(() => {
    if (!catalog || !categorySlug) return [];
    return catalog.products
      .filter(
        (item) => item.category_slug === categorySlug && item.id !== product.id,
      )
      .slice(0, 4);
  }, [catalog, categorySlug, product.id]);

  const canAdd =
    !adding && sizeChosen && (sizeInCart || product.is_in_stock);
  const addLabel = adding
    ? "Adding…"
    : !sizeChosen
      ? "Select size"
      : sizeInCart
        ? "In Cart"
        : product.is_in_stock
          ? "Add to Cart"
          : "Sold out";
  const handleAdd = () => {
    if (sizeInCart) openCart();
    else void addProduct(product, { quantity, size });
  };

  const [buying, setBuying] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const handleBuyNow = async () => {
    if (buying || !canAdd) return;
    setBuying(true);
    try {
      if (!sizeInCart && !(await addProduct(product, { quantity, size })))
        return;
      router.push("/checkout");
    } finally {
      setBuying(false);
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: product.title, url });
        return;
      } catch (err) {
        // User dismissed the sheet; don't fall back to the clipboard.
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy the link");
    }
  };

  const addedAt = new Date(product.created_at).toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  // Exact counts only at <=5 (scarcity nudge); "In stock" otherwise so
  // full inventory stays unpublished.
  const availabilityLabel = !product.is_in_stock
    ? "Out of stock"
    : product.stock_quantity <= 5
      ? `Only ${product.stock_quantity} left`
      : "In stock";

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ArrowLeft className="size-4" />
        Back to store
      </Link>

      {/* Image column is capped (360px/480px) so it stays generous without
          dominating the page; details take the rest of the row from md up. */}
      <div className="mt-6 grid gap-8 md:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)]">
        <div className="-mx-4 space-y-3 sm:mx-0">
          <div
            className={`relative aspect-[3/4] w-full overflow-hidden border-y bg-muted sm:rounded-2xl sm:border ${
              current?.image
                ? zoom
                  ? "cursor-zoom-out"
                  : "cursor-zoom-in"
                : ""
            }`}
            onClick={(e) => {
              if (!current?.image) return;
              // Click/tap toggles the magnifier; zooming never happens on hover.
              if (zoom) setZoom(null);
              else setZoomFromEvent(e);
            }}
            onPointerMove={(e) => {
              // Pointer/drag pans while zoomed; hovering alone does nothing.
              if (zoom) setZoomFromEvent(e);
            }}
            onPointerCancel={() => setZoom(null)}
          >
            {current?.image ? (
              <Image
                key={current.id}
                src={mediaUrl(current.image)}
                alt={current.alt_text || product.title}
                fill
                loading="eager"
                sizes="(max-width: 768px) 100vw, (max-width: 1024px) 360px, 480px"
                className="object-cover transition-transform duration-150 ease-out"
                style={
                  zoom
                    ? {
                        transform: "scale(2.5)",
                        transformOrigin: `${zoom.x}% ${zoom.y}%`,
                      }
                    : undefined
                }
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ImageIcon
                  className="size-10 text-muted-foreground/60"
                  aria-hidden="true"
                />
              </div>
            )}

            {product.is_on_sale && (
              <Badge className="absolute top-3 left-3">Sale</Badge>
            )}

            {!product.is_in_stock && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                <Badge variant="destructive">Out of stock</Badge>
              </div>
            )}

            {current?.image && (
              <div
                aria-hidden="true"
                className="absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-full border bg-card/80 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur"
              >
                <ZoomIn className="size-3.5" />
                <span className="sm:hidden">
                  {zoom ? "Tap to close" : "Tap to zoom"}
                </span>
                <span className="hidden sm:inline">
                  {zoom ? "Click to close" : "Click to zoom"}
                </span>
              </div>
            )}
          </div>

          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto px-4 pb-1 sm:px-0">
              {images.map((image, index) => (
                <button
                  key={image.id}
                  type="button"
                  aria-label={`View photo ${index + 1}`}
                  aria-current={index === activeImage}
                  onClick={() => {
                    setActiveImage(index);
                    setZoom(null);
                  }}
                  className={`relative size-16 shrink-0 overflow-hidden rounded-lg border-2 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 ${
                    index === activeImage
                      ? "border-primary"
                      : "border-transparent hover:border-border"
                  }`}
                >
                  <Image
                    src={mediaUrl(image.image)}
                    alt=""
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {product.title}
              </h1>

              {/* Display-only stars; shoppers rate from the review form below. */}
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span
                  role="img"
                  aria-label={`Rated ${rating.average_rating ?? 0} out of 5`}
                  className="inline-flex items-center gap-0.5"
                >
                  {[1, 2, 3, 4, 5].map((star) => (
                    <StarGlyph
                      key={star}
                      fill={Math.min(
                        Math.max((rating.average_rating ?? 0) - (star - 1), 0),
                        1,
                      )}
                    />
                  ))}
                </span>
                <span className="text-xs text-muted-foreground">
                  {rating.rating_count > 0
                    ? `${rating.average_rating} avg from ${rating.rating_count} rating${rating.rating_count === 1 ? "" : "s"}`
                    : "No ratings yet"}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon-lg"
                aria-label={`Share ${product.title}`}
                onClick={() => void handleShare()}
              >
                <Share2 className="size-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-lg"
                aria-label={
                  wishlisted
                    ? `Remove ${product.title} from wishlist`
                    : `Save ${product.title} to wishlist`
                }
                aria-pressed={wishlisted}
                onClick={() => toggleWishlist(product)}
              >
                <Heart
                  className={
                    wishlisted ? "size-5 fill-primary text-primary" : "size-5"
                  }
                />
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-2xl font-semibold tabular-nums">
              Ksh {formatKsh(product.current_price)}
            </span>
            {product.is_on_sale && (
              <span className="text-base text-muted-foreground line-through tabular-nums">
                Ksh {formatKsh(product.base_price)}
              </span>
            )}
          </div>

          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {product.category ? (
              <Link
                href={`/categories/${product.category.slug}`}
                className="rounded-sm outline-none transition-colors hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {product.category.name}
              </Link>
            ) : (
              <span>Wayaz Collection</span>
            )}
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">Added {addedAt}</span>
          </p>

          {/* Size */}
          {hasSizes && (
            <div className="mt-5 sm:mt-6">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium">Size</span>
                <a
                  href={waLink(
                    `Hi! What size should I get for "${product.title}"?`,
                    settings?.whatsapp_number,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-sm text-xs text-muted-foreground outline-none transition-colors hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  Not sure of your size? Ask on WhatsApp
                </a>
              </div>
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
                    disabled={adding}
                    onClick={() => setSize(option)}
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
          )}

          {/* Quantity */}
          <div className="mt-5 flex items-center justify-between sm:mt-6">
            <span className="text-sm font-medium">Quantity</span>
            <div className="flex items-center rounded-lg border">
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Decrease quantity"
                disabled={adding || quantity <= 1}
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
                disabled={adding || quantity >= maxQuantity}
                onClick={() =>
                  setQuantity((prev) => Math.min(maxQuantity, prev + 1))
                }
              >
                <Plus />
              </Button>
            </div>
          </div>
          {product.is_in_stock && product.stock_quantity <= 5 && (
            <p className="mt-1.5 text-right text-xs text-muted-foreground tabular-nums">
              Max {product.stock_quantity} available
            </p>
          )}

          {/* Sold-out pieces swap this row for the notify offer instead of
              greyed-out buttons. */}
          {!product.is_in_stock ? (
            <Button
              size="lg"
              variant="outline"
              className={cn(
                "mt-5 w-full gap-2 sm:mt-6",
                "restock-button",
              )}
              onClick={() => setNotifyOpen(true)}
            >
              <BellRing className="size-4" />
              Notify on restock
            </Button>
          ) : (
            <div
              ref={actionsRef}
              className="mt-5 flex flex-col gap-3 sm:mt-6 sm:flex-row"
            >
              <Button
                size="lg"
                className="w-full gap-2 sm:flex-1"
                disabled={!canAdd}
                onClick={handleAdd}
              >
                {sizeInCart ? (
                  <Check className="size-4" />
                ) : (
                  <ShoppingBag className="size-4" />
                )}
                {addLabel}
              </Button>
              <Button
                size="lg"
                variant="secondary"
                className="w-full gap-2 sm:flex-1"
                disabled={!canAdd || buying}
                onClick={() => void handleBuyNow()}
              >
                <Zap className="size-4" />
                {buying ? "Adding…" : "Buy now"}
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="w-full gap-2 sm:flex-1"
                asChild
              >
                <a
                  href={productWhatsappLink(product, settings?.whatsapp_number)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <WhatsAppIcon className="size-4" />
                  Order on WhatsApp
                </a>
              </Button>
            </div>
          )}

          {product.description && (
            <div className="mt-5 sm:mt-6">
              <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Description
              </h2>
              <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                {product.description}
              </p>
            </div>
          )}

          <h2 className="mt-5 text-xs font-semibold tracking-wider text-muted-foreground uppercase sm:mt-6">
            Product information
          </h2>
          <dl className="mt-2 divide-y rounded-xl border text-sm">
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-muted-foreground">Category</dt>
              <dd className="font-medium">
                {product.category ? (
                  <Link
                    href={`/categories/${product.category.slug}`}
                    className="rounded-sm outline-none transition-colors hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {product.category.name}
                  </Link>
                ) : (
                  "Wayaz Collection"
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-muted-foreground">Sizes</dt>
              <dd className="font-medium">
                {hasSizes ? product.sizes.join(", ") : "One size"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-muted-foreground">Availability</dt>
              <dd
                className={`font-medium tabular-nums ${
                  !product.is_in_stock
                    ? "text-destructive"
                    : product.stock_quantity <= 5
                      ? "text-amber-600 dark:text-amber-400"
                      : ""
                }`}
              >
                {availabilityLabel}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-muted-foreground">Listed</dt>
              <dd className="font-medium tabular-nums">{addedAt}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* New posts feed the aggregate back into the header average. */}
      <ProductReviews
        key={product.slug}
        slug={product.slug}
        rating={rating}
        onRatingChange={setRating}
      />

      {related.length > 0 && product.category && (
        <section className="mt-12 border-t pt-8">
          <h2 className="text-lg font-semibold tracking-tight uppercase">
            More in {product.category.name}
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {related.map((item) => (
              <ProductCard
                key={item.id}
                product={item}
                adding={addingId === item.id}
                inCart={cartProductIds.has(item.id)}
                onAdd={(p) => void addProduct(p)}

              />
            ))}
          </div>
        </section>
      )}
      <div
        ref={barRef}
        aria-hidden={!showStickyBar}
        inert={!showStickyBar}
        className={`fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] backdrop-blur transition-transform duration-200 ease-out supports-[backdrop-filter]:bg-background/80 ${
          showStickyBar
            ? "translate-y-0"
            : "pointer-events-none translate-y-full"
        }`}
      >
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-4 pb-[calc(1rem_+_env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:gap-5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {current?.image ? (
              <Image
                src={mediaUrl(current.image)}
                alt=""
                width={56}
                height={56}
                loading="eager"
                className="size-12 shrink-0 rounded-xl border object-cover sm:size-14"
              />
            ) : (
              <div className="grid size-12 shrink-0 place-items-center rounded-xl border bg-muted sm:size-14">
                <ImageIcon
                  className="size-5 text-muted-foreground/60"
                  aria-hidden="true"
                />
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight sm:text-base">
                {product.title}
              </p>
              <p className="mt-0.5 flex items-baseline gap-2 text-sm">
                <span className="font-bold tabular-nums">
                  Ksh {formatKsh(product.current_price)}
                </span>
                {product.is_on_sale && (
                  <span className="text-xs text-muted-foreground line-through tabular-nums">
                    Ksh {formatKsh(product.base_price)}
                  </span>
                )}
              </p>
              {!product.is_in_stock && (
                <p className="text-xs font-medium text-destructive">
                  Out of stock
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:ml-auto sm:flex sm:gap-3">
            <Button
              size="lg"
              variant="outline"
              className="col-span-2 gap-2 rounded-full sm:col-span-1"
              asChild
            >
              <a
                href={productWhatsappLink(product, settings?.whatsapp_number)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <WhatsAppIcon className="size-4" />
                WhatsApp
              </a>
            </Button>
            <Button
              size="lg"
              className="gap-2 rounded-full sm:min-w-40"
              variant={product.is_in_stock ? "default" : "outline"}
              disabled={!canAdd}
              onClick={handleAdd}
            >
              {sizeInCart ? (
                <Check className="size-4" />
              ) : (
                <ShoppingBag className="size-4" />
              )}
              {addLabel}
            </Button>
            {product.is_in_stock ? (
              <Button
                size="lg"
                variant="secondary"
                className="gap-2 rounded-full sm:min-w-32"
                disabled={!canAdd || buying}
                onClick={() => void handleBuyNow()}
              >
                <Zap className="size-4" />
                {buying ? "Adding…" : "Buy now"}
              </Button>
            ) : (
              <Button
                size="lg"
                className={cn(
                  "gap-2 rounded-full sm:min-w-44",
                  "restock-button",
                )}
                onClick={() => setNotifyOpen(true)}
              >
                <BellRing className="size-4" />
                Notify on restock
              </Button>
            )}
          </div>
        </div>
      </div>

      <RestockDialog
        product={product}
        open={notifyOpen}
        onOpenChange={setNotifyOpen}
      />
    </div>
  );
}
