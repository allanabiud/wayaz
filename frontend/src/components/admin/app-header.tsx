"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronRight,
  Clock,
  LayoutDashboard,
  Loader2,
  LogOut,
  Package,
  Search,
  User,
  Users,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { AdminOrdersResponse, Paginated, Product } from "@/lib/types";

function money(value: string | number): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-KE") : String(value);
}

const SEGMENT_LABELS: Record<string, string> = {
  products: "Products",
  customers: "Customers",
};

const ORDER_STATUSES: Array<[string, string]> = [
  ["PENDING_PAYMENT", "Pending payment"],
  ["PAID", "Paid"],
  ["PROCESSING", "Processing"],
  ["SHIPPED", "Shipped"],
  ["DELIVERED", "Delivered"],
  ["CANCELLED", "Cancelled"],
];

function titleize(segment: string): string {
  return segment
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const startsAdmin = segments[0] === "admin";
  const tail = startsAdmin ? segments.slice(1) : segments;

  // Product routes show the fetched title instead of the raw id.
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
  const [orders, setOrders] = useState<AdminOrdersResponse | null>(null);
  const [ordersFetching, setOrdersFetching] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [orderQuery, setOrderQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Badge + sheet: all orders, refetched when filters change (search debounced).
  useEffect(() => {
    let active = true;
    const search = orderQuery.trim();
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search) params.set("search", search);
      setOrdersFetching(true);
      api
        .get<AdminOrdersResponse>(`/api/v1/admin/orders/?${params.toString()}`)
        .then((res) => {
          if (active) setOrders(res);
        })
        .catch(() => {
          // Keep the last good snapshot; an empty sheet beats a broken header.
        })
        .finally(() => {
          if (active) setOrdersFetching(false);
        });
    }, search ? 250 : 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [statusFilter, orderQuery]);

  // Cmd/Ctrl+K focuses search; Esc closes the results dropdown.
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
    if (!q) return;

    const timer = setTimeout(async () => {
      setSearching(true);
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

        <div className="flex-1" />

        {/* Search expands on focus to the results popup width */}
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

          {searching && query.trim() ? (
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

        <div className="flex items-center gap-2">
          {/* All orders: pending-count badge button + filterable side sheet */}
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="lg"
                className="gap-2 cursor-pointer"
                aria-label="Orders"
              >
                <Clock className="size-4" />
                <span className="hidden sm:inline">Orders</span>
                {orders && (
                  <Badge className="tabular-nums">{orders.pending_count}</Badge>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent className="gap-0">
              <SheetHeader className="border-b">
                <SheetTitle>Orders</SheetTitle>
                <SheetDescription>
                  {orders
                    ? `${orders.pending_count} pending · ${orders.count} ${
                        statusFilter !== "all" || orderQuery.trim()
                          ? "matching"
                          : "total"
                      }`
                    : "Loading…"}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-2 border-b px-4 py-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={orderQuery}
                    onChange={(e) => setOrderQuery(e.target.value)}
                    placeholder="Search order #, name or email…"
                    aria-label="Search orders"
                    className="h-9 pl-8 pr-8"
                  />
                  {ordersFetching && (
                    <Loader2 className="absolute right-2.5 top-1/2 size-3 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger
                    className="h-9 w-full"
                    aria-label="Filter by status"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="pending">
                      Pending - not delivered or cancelled
                    </SelectItem>
                    {ORDER_STATUSES.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
                {!orders ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                ) : orders.results.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    {statusFilter === "all" && !orderQuery.trim()
                      ? "No orders yet."
                      : "No orders match your filters."}
                  </p>
                ) : (
                  <>
                    {orders.results.map((order) => (
                      <div
                        key={order.order_number}
                        className="rounded-lg border border-border/60 p-3 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-semibold text-foreground">
                            {order.order_number}
                          </span>
                          <Badge variant="outline" className="text-[10px]">
                            {order.status_display}
                          </Badge>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between gap-2 text-muted-foreground">
                          <span className="truncate">{order.customer}</span>
                          <span className="shrink-0">
                            {new Date(order.created_at).toLocaleDateString("en-KE", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">
                            {order.item_count} item{order.item_count === 1 ? "" : "s"} ·{" "}
                            {order.payment_method_display}
                          </span>
                          <span className="font-bold text-primary">
                            Ksh {money(order.total_amount)}
                          </span>
                        </div>
                      </div>
                    ))}
                    {orders.count > orders.results.length && (
                      <p className="pt-1 text-center text-[11px] text-muted-foreground">
                        Showing the latest {orders.results.length} of {orders.count}
                      </p>
                    )}
                  </>
                )}
              </div>
              <SheetFooter className="border-t">
                <Button variant="outline" className="w-full" disabled>
                  Open orders page
                </Button>
                <p className="text-center text-[11px] text-muted-foreground">
                  Orders page coming soon
                </p>
              </SheetFooter>
            </SheetContent>
          </Sheet>

          <ThemeToggle />

          {/* Account */}
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
                  {user?.display_name || user?.username}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold leading-none truncate">
                      {user?.display_name || user?.username}
                    </p>
                    <Badge
                      variant="outline"
                      className="text-[10px] uppercase font-bold text-primary border-primary/30 shrink-0"
                    >
                      {user?.role}
                    </Badge>
                  </div>
                  <p className="text-xs leading-none text-muted-foreground truncate">
                    {user?.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => router.push("/admin")}
                className="cursor-pointer"
              >
                <LayoutDashboard className="size-4" />
                <span>Dashboard</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => router.push("/admin/products")}
                className="cursor-pointer"
              >
                <Package className="size-4" />
                <span>Manage Products</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => router.push("/admin/customers")}
                className="cursor-pointer"
              >
                <Users className="size-4" />
                <span>Customers</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowLogoutDialog(true)}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <LogOut className="size-4" />
                <span>Sign Out</span>
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
