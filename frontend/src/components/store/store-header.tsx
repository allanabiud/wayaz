"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowRight,
  ClipboardList,
  Clock,
  Flame,
  Heart,
  Image as ImageIcon,
  LayoutDashboard,
  LogIn,
  LogOut,
  Search,
  ShoppingBag,
  User,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/lib/auth-context";
import { useStore } from "@/components/store/store-context";
import { mediaUrl } from "@/lib/media";
import {
  clearSearchHistory,
  forgetSearch,
  formatKsh,
  hotSearches,
  rememberSearch,
  storedSearchHistory,
} from "@/lib/store";

/**
 * Full-bleed store header: logo flush to the left edge, search bar filling
 * all remaining length, actions at the right edge. The search popover keeps
 * category shortcuts pinned at the top, shows recent + hot searches while
 * idle, fills with product results as you type, and Enter (or the footer
 * link) opens the full /search results page. Wraps to two rows on small
 * screens; desktop keeps the single h-14 row.
 */
export function StoreHeader() {
  const router = useRouter();
  const {
    cartCount,
    openCart,
    wishlistCount,
    openWishlist,
    catalog,
    catalogLoading,
    openLogin,
  } = useStore();
  const { user, isAuthenticated, canManage, signOut } = useAuth();
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const activeQuery = query.trim();

  // Restore recent searches saved on this device (async so hydration matches).
  useEffect(() => {
    let cancelled = false;
    storedSearchHistory()
      .then((terms) => {
        if (!cancelled) setHistory(terms);
      })
      .catch(() => {
        // Unreadable storage simply starts with an empty list.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Category shortcuts stay pinned at the top of the popover.
  const pinnedCategories = useMemo(
    () => (catalog ? catalog.categories.filter((c) => c.product_count > 0) : []),
    [catalog],
  );
  const hotTerms = useMemo(
    () => (catalog ? hotSearches(catalog) : []),
    [catalog],
  );

  const searchResults = useMemo(() => {
    if (!catalog) return { list: [], total: 0 };
    const q = activeQuery.toLowerCase();
    const matches = q
      ? catalog.products.filter(
          (product) =>
            product.title.toLowerCase().includes(q) ||
            (product.category ?? "").toLowerCase().includes(q),
        )
      : catalog.products;
    return { list: matches.slice(0, 50), total: matches.length };
  }, [catalog, activeQuery]);

  // Open the product page for a search hit.
  const selectResult = (slug: string) => {
    setSearchOpen(false);
    setQuery("");
    router.push(`/products/${slug}`);
  };

  // Record the term in this device's history and open the results page.
  const runSearch = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setHistory(rememberSearch(trimmed));
    setSearchOpen(false);
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  const removeTerm = (term: string) => setHistory(forgetSearch(term));
  const clearTerms = () => setHistory(clearSearchHistory());

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2 pr-2 sm:h-14 sm:flex-nowrap sm:gap-x-4 sm:py-0 sm:pr-3">
        <Link
          href="/"
          className="order-1 flex min-w-0 shrink-0 items-center outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:order-none sm:h-full"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/waynz_logo.jpg"
            alt="Wayaz Collection"
            className="h-auto max-h-9 w-auto sm:h-full sm:max-h-full"
          />
        </Link>

        {/* Search - takes every remaining pixel of header width; the
            results popover drops down beneath it with thumbnails */}
        <div
          role="search"
          className="relative order-3 w-full min-w-0 sm:order-none sm:flex-1"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setSearchOpen(false);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setSearchOpen(false);
          }}
        >
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSearchOpen(true);
            }}
            onClick={() => setSearchOpen(true)}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && activeQuery) {
                event.preventDefault();
                runSearch(activeQuery);
              }
            }}
            placeholder="Search products…"
            aria-label="Search products"
            aria-expanded={searchOpen}
            className="h-9 pr-8 pl-9"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}

          {searchOpen && (
            <div
              aria-label="Search suggestions"
              className="absolute top-full right-0 left-0 z-50 mt-2 origin-top animate-in fade-in-0 zoom-in-95 duration-100 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10"
              onMouseDown={(event) => event.preventDefault()}
            >
              {/* Category shortcuts pinned above every popover state */}
              {(catalogLoading || pinnedCategories.length > 0) && (
                <div className="border-b p-3">
                  <div className="flex flex-wrap gap-1.5">
                    {catalogLoading && !catalog
                      ? Array.from({ length: 4 }).map((_, index) => (
                          <Skeleton
                            key={index}
                            className="h-8 w-20 rounded-full"
                          />
                        ))
                      : pinnedCategories.map((category) => (
                          <Button
                            key={category.id}
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-full px-3 text-xs"
                            asChild
                          >
                            <Link
                              href={`/categories/${category.slug}`}
                              onClick={() => setSearchOpen(false)}
                            >
                              {category.name}
                            </Link>
                          </Button>
                        ))}
                  </div>
                </div>
              )}

              {activeQuery ? (
                searchResults.total === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                    {catalogLoading && !catalog
                      ? "Loading products…"
                      : `No products match “${activeQuery}”.`}
                  </p>
                ) : (
                  <>
                    <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                      {searchResults.total}{" "}
                      {searchResults.total === 1 ? "result" : "results"}
                    </div>
                    <ul className="max-h-72 overflow-y-auto p-1">
                      {searchResults.list.map((product) => (
                        <li key={product.id}>
                          <button
                            type="button"
                            onClick={() => selectResult(product.slug)}
                            className="flex w-full items-center gap-3 rounded-lg p-2 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
                          >
                            <span className="h-12 w-9 shrink-0 overflow-hidden rounded-md bg-muted">
                              {product.primary_image ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                  src={mediaUrl(product.primary_image)}
                                  alt=""
                                  loading="lazy"
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <span className="flex h-full w-full items-center justify-center">
                                  <ImageIcon
                                    className="size-4 text-muted-foreground/60"
                                    aria-hidden="true"
                                  />
                                </span>
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">
                                {product.title}
                              </span>
                              {product.category && (
                                <span className="block truncate text-xs text-muted-foreground">
                                  {product.category}
                                </span>
                              )}
                            </span>
                            <span className="shrink-0 text-sm font-semibold tabular-nums">
                              Ksh {formatKsh(product.current_price)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={() => runSearch(activeQuery)}
                      className="flex w-full items-center justify-between gap-2 border-t px-4 py-2.5 text-left text-sm font-medium outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Search
                          className="size-3.5 shrink-0 text-gold"
                          aria-hidden="true"
                        />
                        <span className="truncate">
                          See all {searchResults.total}{" "}
                          {searchResults.total === 1 ? "result" : "results"} for
                          “{activeQuery}”
                        </span>
                      </span>
                      <ArrowRight
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </button>
                  </>
                )
              ) : (
                <div className="max-h-80 space-y-4 overflow-y-auto p-3">
                  {history.length > 0 && (
                    <section>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-gold">
                          <Clock className="size-3" aria-hidden="true" />
                          Recent searches
                        </h3>
                        <button
                          type="button"
                          onClick={clearTerms}
                          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                        >
                          Clear
                        </button>
                      </div>
                      <ul className="mt-2 space-y-0.5">
                        {history.map((term) => (
                          <li key={term}>
                            <div className="flex items-center gap-1 rounded-lg transition-colors focus-within:bg-accent hover:bg-accent">
                              <button
                                type="button"
                                onClick={() => runSearch(term)}
                                className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm outline-none"
                              >
                                <Search
                                  className="size-3.5 shrink-0 text-muted-foreground"
                                  aria-hidden="true"
                                />
                                <span className="truncate">{term}</span>
                              </button>
                              <button
                                type="button"
                                aria-label={`Remove ${term} from history`}
                                onClick={() => removeTerm(term)}
                                className="mr-1 shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                              >
                                <X className="size-3.5" />
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {(catalogLoading || hotTerms.length > 0) && (
                    <section>
                      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-gold">
                        <Flame className="size-3" aria-hidden="true" />
                        Hot searches
                      </h3>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {catalogLoading && !catalog
                          ? Array.from({ length: 4 }).map((_, index) => (
                              <Skeleton
                                key={index}
                                className="h-8 w-20 rounded-full"
                              />
                            ))
                          : hotTerms.map((term) => (
                              <button
                                key={term}
                                type="button"
                                onClick={() => runSearch(term)}
                                className="flex h-8 items-center rounded-full border bg-muted/40 px-3 text-xs font-medium outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
                              >
                                {term}
                              </button>
                            ))}
                      </div>
                    </section>
                  )}

                  {history.length === 0 &&
                    hotTerms.length === 0 &&
                    !catalogLoading && (
                      <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                        {catalog
                          ? "No products yet."
                          : "Products failed to load - refresh to try again."}
                      </p>
                    )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="order-2 flex shrink-0 items-center gap-2 sm:order-none">
          <ThemeToggle />

          {/* Account - always a dropdown: sign in at the top when signed
              out, then wishlist + orders for everyone */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="lg"
                className="gap-2 cursor-pointer"
                aria-label="Account menu"
              >
                <User className="size-4" />
                <span className="hidden sm:inline max-w-[120px] truncate">
                  {isAuthenticated
                    ? user?.display_name || user?.username
                    : "Account"}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {!isAuthenticated ? (
                <>
                  <DropdownMenuItem
                    onClick={openLogin}
                    className="cursor-pointer font-medium text-primary focus:text-primary focus:bg-primary/10"
                  >
                    <LogIn className="size-4" />
                    <span>Sign In</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              ) : (
                <>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold leading-none truncate">
                          {user?.display_name || user?.username}
                        </p>
                        {canManage && (
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase font-bold text-primary border-primary/30 shrink-0"
                          >
                            {user?.role || "Staff"}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs leading-none text-muted-foreground truncate">
                        {user?.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={openWishlist} className="cursor-pointer">
                <Heart className="size-4" />
                <span>Wishlist</span>
                {wishlistCount > 0 && (
                  <Badge className="ml-auto text-[10px] tabular-nums">
                    {wishlistCount}
                  </Badge>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/orders" className="flex items-center gap-1.5">
                  <ClipboardList className="size-4" />
                  <span>Orders</span>
                </Link>
              </DropdownMenuItem>
              {canManage && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild className="cursor-pointer text-primary font-medium focus:text-primary focus:bg-primary/10">
                    <Link href="/admin" className="flex items-center gap-1.5">
                      <LayoutDashboard className="size-4" />
                      <span>Admin Dashboard</span>
                    </Link>
                  </DropdownMenuItem>
                </>
              )}
              {isAuthenticated && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      signOut();
                      toast.success("Signed out successfully.");
                    }}
                    className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
                  >
                    <LogOut className="size-4" />
                    <span>Sign Out</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Cart */}
          <Button
            variant="outline"
            size="lg"
            className="gap-2 cursor-pointer"
            aria-label="Open cart"
            onClick={openCart}
          >
            <ShoppingBag className="size-4" />
            <span className="hidden sm:inline">Cart</span>
            {cartCount > 0 && <Badge className="tabular-nums">{cartCount}</Badge>}
          </Button>
        </div>
      </div>
    </header>
  );
}
