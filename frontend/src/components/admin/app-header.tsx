"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  LogOut,
  Package,
  Search,
  Store,
  X,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Paginated, Product } from "@/lib/types";

function getInitials(name?: string) {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

function money(value: string | number): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-KE") : String(value);
}

const SEGMENT_LABELS: Record<string, string> = {
  products: "Products",
  customers: "Customers",
};

function titleize(segment: string): string {
  return segment
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Haze-style breadcrumb: `Dashboard > Products > <product title>` */
function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const startsAdmin = segments[0] === "admin";
  const tail = startsAdmin ? segments.slice(1) : segments;

  // /admin/products/<id> and /admin/products/<id>/edit both show the title.
  const isProductRoute =
    startsAdmin &&
    segments[1] === "products" &&
    /^\d+$/.test(segments[2] ?? "");
  const productId = isProductRoute ? segments[2] : null;

  const [fetchedTitle, setFetchedTitle] = useState<{
    id: string;
    title: string;
  } | null>(null);

  useEffect(() => {
    if (!productId) return;
    let active = true;
    api
      .get<Product>(`/api/v1/admin/products/${productId}/`)
      .then((p) => {
        if (active) setFetchedTitle({ id: productId, title: p.title });
      })
      .catch(() => {
        /* keep the numeric fallback */
      });
    return () => {
      active = false;
    };
  }, [productId]);

  const productTitle =
    fetchedTitle && fetchedTitle.id === productId ? fetchedTitle.title : null;

  const crumbs: Array<{ label: string; href: string | null }> = [
    { label: "Dashboard", href: "/admin" },
  ];
  tail.forEach((segment, idx) => {
    const isLast = idx === tail.length - 1;
    const href =
      "/" + segments.slice(0, (startsAdmin ? 1 : 0) + idx + 1).join("/");
    // The numeric segment under /products is the product itself; deeper
    // segments (like "edit") titleize as usual.
    const isProductIdSegment =
      isProductRoute && startsAdmin && idx === 1;
    let label = SEGMENT_LABELS[segment] ?? titleize(segment);
    if (isProductIdSegment) {
      label = productTitle ?? `Product #${productId}`;
    }
    crumbs.push({ label, href: isLast ? null : href });
  });

  return (
    <nav aria-label="breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1.5 text-sm">
        {crumbs.map((crumb, index) => (
          <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
            {index > 0 && (
              <ChevronRight
                aria-hidden
                className="size-3.5 shrink-0 text-muted-foreground/50"
              />
            )}
            {crumb.href === null ? (
              <span className="truncate font-medium text-foreground">
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="truncate text-muted-foreground transition-colors hover:text-foreground"
              >
                {crumb.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function AppHeader() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K focuses the search field; Esc closes the results dropdown (query preserved)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setDropdownOpen(true);
        requestAnimationFrame(() => inputRef.current?.focus());
        return;
      }
      if (e.key === "Escape") {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Click outside closes the results dropdown (query preserved)
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.get<Paginated<Product>>(
          `/api/v1/admin/products/?search=${encodeURIComponent(q)}`
        );
        setResults(res.results.slice(0, 8));
      } catch (err) {
        console.error("Live search failed:", err);
      } finally {
        setSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelectProduct = (prod: Product) => {
    setDropdownOpen(false);
    setQuery("");
    inputRef.current?.blur();
    router.push(`/admin/products/${prod.id}`);
  };

  return (
    <>
      <header className="sticky top-0 z-30 flex h-[calc(var(--sidebar-width)*362/1600)] shrink-0 items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
        <SidebarTrigger
          className={`-ml-1 text-muted-foreground hover:text-foreground ${searchFocused ? "hidden" : "md:hidden"}`}
        />

        <Breadcrumbs />

        {/* Free space */}
        <div className="flex-1" />

        {/* Live Search: always visible; expands on focus to exactly the results popup width */}
        <div
          ref={containerRef}
          className={`relative shrink-0 transition-[width] duration-200 ${searchFocused ? "w-52 sm:w-96" : "w-40 sm:w-56 lg:w-64"}`}
        >
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search products…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setDropdownOpen(true);
            }}
            onFocus={() => {
              setSearchFocused(true);
              setDropdownOpen(true);
            }}
            onBlur={() => {
              setSearchFocused(false);
              setDropdownOpen(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setDropdownOpen(false);
              }
            }}
            className="h-9 w-full rounded-lg border border-border/60 bg-muted/50 pl-8 pr-8 text-sm outline-none transition-all duration-200 focus:bg-background focus:ring-2 focus:ring-primary/25 focus:border-primary/40"
          />

          {searching ? (
            <Loader2 className="absolute right-2.5 top-1/2 size-3 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : query ? (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setQuery(""); setResults([]); setDropdownOpen(false); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 flex size-4 items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="size-3" />
            </button>
          ) : null}

          {dropdownOpen && query.trim().length > 0 && (
            <div
              onMouseDown={(e) => e.preventDefault()}
              className="absolute right-0 top-full mt-2 w-full rounded-xl border border-border/60 bg-popover p-1.5 text-popover-foreground shadow-xl ring-1 ring-foreground/5 z-50 animate-in fade-in-0 zoom-in-95"
            >
              <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Products {results.length > 0 && `(${results.length})`}
              </div>
              <Separator className="my-1 opacity-50" />
              {searching ? (
                <div className="flex items-center justify-center py-6 text-xs text-muted-foreground gap-2">
                  <Loader2 className="size-3 animate-spin text-primary" />
                  Searching catalog…
                </div>
              ) : results.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  No products found for &ldquo;{query}&rdquo;
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto space-y-0.5">
                  {results.map((prod) => {
                    const isOutOfStock = !prod.is_in_stock || prod.stock_quantity <= 0;
                    return (
                      <div
                        key={prod.id}
                        onClick={() => handleSelectProduct(prod)}
                        className="flex items-center gap-2.5 rounded-lg p-2 text-xs cursor-pointer hover:bg-accent transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-foreground leading-tight">{prod.title}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground">
                            <span>{prod.category_name || "Catalog"}</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end shrink-0">
                          <span className="font-bold text-primary">Ksh {money(prod.sale_price ?? prod.base_price)}</span>
                          <span className={`text-[10px] font-medium ${isOutOfStock ? "text-destructive" : "text-muted-foreground"}`}>
                            {isOutOfStock ? "Out of stock" : `${prod.stock_quantity} pcs`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            asChild
            className="hidden sm:inline-flex text-xs h-8 gap-1.5 cursor-pointer"
          >
            <Link href="/">
              <Store className="size-3.5" />
              <span>Live Store</span>
            </Link>
          </Button>

          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 rounded-lg px-2 py-1.5 h-9 hover:bg-accent cursor-pointer">
                <Avatar className="size-7 shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                    {getInitials(user?.display_name || user?.username)}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden text-left md:inline-block">
                  <span className="block text-xs font-semibold leading-none text-foreground">
                    {user?.display_name || user?.username}
                  </span>
                  <span className="block text-[10px] text-muted-foreground capitalize leading-tight mt-0.5">
                    {user?.role}
                  </span>
                </span>
                <ChevronDown className="hidden md:block size-3 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6} className="w-56 p-1.5">
              <DropdownMenuLabel className="px-2 py-1.5 font-normal">
                <p className="text-xs font-semibold text-foreground">{user?.display_name || user?.username}</p>
                {user?.email && <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="cursor-pointer text-xs">
                <Link href="/" className="flex items-center">
                  <Store className="mr-2 size-3.5" />View Live Store
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/admin/products")} className="cursor-pointer text-xs">
                <Package className="mr-2 size-3.5" />Manage Products
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowLogoutDialog(true)} className="cursor-pointer text-xs text-destructive focus:text-destructive">
                <LogOut className="mr-2 size-3.5" />Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <Dialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Sign Out</DialogTitle>
            <DialogDescription>Are you sure you want to end your backoffice session?</DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2">
            <Button variant="outline" onClick={() => setShowLogoutDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { setShowLogoutDialog(false); signOut(); }}>Sign Out</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
