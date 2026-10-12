"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  KeyRound,
  LayoutDashboard,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  Package,
  Phone,
  Search,
  Settings,
  User,
  Users,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { api, login, tokenStore } from "@/lib/api";
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
  ["PROCESSING", "Processing"],
  ["CONFIRMED", "Confirmed"],
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
  const { user, signIn, signOut } = useAuth();
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"profile" | "security">("profile");
  const [profileName, setProfileName] = useState(user?.display_name || "");
  const [profilePhone, setProfilePhone] = useState(user?.phone_number || "");
  const [profileEmail, setProfileEmail] = useState(user?.email || "");
  const [savingProfile, setSavingProfile] = useState(false);

  // Security / Password change state
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const [orders, setOrders] = useState<AdminOrdersResponse | null>(null);
  const [ordersFetching, setOrdersFetching] = useState(false);
  const [ordersSheetOpen, setOrdersSheetOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [orderQuery, setOrderQuery] = useState("");
  const [expandedOrderNumber, setExpandedOrderNumber] = useState<string | null>(null);
  const [updatingOrderNumber, setUpdatingOrderNumber] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName.trim()) {
      toast.error("Name is required");
      return;
    }
    setSavingProfile(true);
    try {
      const parts = profileName.trim().split(/\s+/);
      const firstName = parts[0] || "";
      const lastName = parts.slice(1).join(" ") || "";
      await api.patch("/api/v1/auth/me/", {
        first_name: firstName,
        last_name: lastName,
        phone_number: profilePhone.trim() || null,
        email: profileEmail.trim(),
      });
      if (user) {
        signIn({
          ...user,
          display_name: profileName.trim(),
          email: profileEmail.trim(),
          phone_number: profilePhone.trim(),
        });
      }
      toast.success("Profile updated successfully!");
      setShowSettingsDialog(false);
    } catch {
      toast.error("Failed to update profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword || !newPassword) {
      toast.error("Please fill in both current and new password.");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }
    setSavingPassword(true);
    try {
      await api.post("/api/v1/auth/change-password/", {
        old_password: oldPassword,
        new_password: newPassword,
      });
      // The change stamps password_changed_at, which retires the tokens
      // this session holds - re-mint them with the new password so the
      // person who just changed it isn't logged out on their next click.
      if (user) {
        const session = await login(user.username, newPassword);
        tokenStore.save({
          access: session.access,
          refresh: session.refresh,
        });
      }
      toast.success("Password changed successfully!");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowSettingsDialog(false);
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Failed to update password. Check your current password.";
      toast.error(message);
    } finally {
      setSavingPassword(false);
    }
  };

  const handleQuickStatusChange = async (orderNumber: string, nextStatus: string) => {
    setUpdatingOrderNumber(orderNumber);
    try {
      await api.patch(`/api/v1/admin/orders/${orderNumber}/`, {
        status: nextStatus,
      });
      toast.success(`Order #${orderNumber} updated to ${nextStatus.replace(/_/g, " ")}`);
      // Update local state immediately
      setOrders((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          results: prev.results.map((o) =>
            o.order_number === orderNumber
              ? {
                  ...o,
                  status: nextStatus,
                  status_display:
                    ORDER_STATUSES.find(([v]) => v === nextStatus)?.[1] ?? nextStatus,
                }
              : o
          ),
        };
      });
    } catch {
      toast.error(`Failed to update status for order #${orderNumber}`);
    } finally {
      setUpdatingOrderNumber(null);
    }
  };

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
            className="h-9 w-full rounded-lg border border-border/60 bg-muted/50 pl-8 pr-8 text-sm outline-none transition-all duration-200 focus:bg-background focus:border-primary"
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
          <Sheet open={ordersSheetOpen} onOpenChange={setOrdersSheetOpen}>
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
                    {orders.results.map((order) => {
                      const isExpanded = expandedOrderNumber === order.order_number;
                      const isUpdating = updatingOrderNumber === order.order_number;
                      return (
                        <div
                          key={order.order_number}
                          className="rounded-lg border border-border/60 bg-card p-3 text-xs transition-shadow hover:shadow-xs"
                        >
                          <div
                            onClick={() =>
                              setExpandedOrderNumber(isExpanded ? null : order.order_number)
                            }
                            className="flex cursor-pointer items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-mono font-semibold text-foreground">
                                {order.order_number}
                              </span>
                              {isExpanded ? (
                                <ChevronUp className="size-3 text-muted-foreground shrink-0" />
                              ) : (
                                <ChevronDown className="size-3 text-muted-foreground shrink-0" />
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Badge variant="outline" className="text-[10px]">
                                {order.status_display}
                              </Badge>
                            </div>
                          </div>

                          <div className="mt-1.5 flex items-center justify-between gap-2 text-muted-foreground">
                            <span className="truncate font-medium text-foreground">{order.customer}</span>
                            <span className="shrink-0 text-[11px]">
                              {new Date(order.created_at).toLocaleDateString("en-KE", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                            </span>
                          </div>

                          <div className="mt-1 flex items-center justify-between gap-2">
                            <span className="text-muted-foreground text-[11px]">
                              {order.item_count} item{order.item_count === 1 ? "" : "s"} ·{" "}
                              {order.payment_method_display}
                            </span>
                            <span className="font-bold text-primary tabular-nums">
                              Ksh {money(order.total_amount)}
                            </span>
                          </div>

                          {/* Inline Status Processor */}
                          <div className="mt-2.5 pt-2 border-t border-border/50 flex items-center justify-between gap-2">
                            <span className="text-[11px] font-medium text-muted-foreground">
                              Update status:
                            </span>
                            <div className="w-36 shrink-0">
                              <Select
                                value={order.status}
                                disabled={isUpdating}
                                onValueChange={(val) =>
                                  handleQuickStatusChange(order.order_number, val)
                                }
                              >
                                <SelectTrigger className="h-7 text-[11px] w-full">
                                  {isUpdating ? (
                                    <div className="flex items-center gap-1">
                                      <Loader2 className="size-3 animate-spin text-primary" />
                                      <span>Saving…</span>
                                    </div>
                                  ) : (
                                    <SelectValue />
                                  )}
                                </SelectTrigger>
                                <SelectContent>
                                  {ORDER_STATUSES.map(([val, label]) => (
                                    <SelectItem key={val} value={val} className="text-xs">
                                      {label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          {/* Expanded Full Details */}
                          {isExpanded && (
                            <div className="mt-3 pt-3 border-t border-border/60 space-y-2 text-[11px] animate-in fade-in-0 duration-200">
                              {/* Customer Contact & Address */}
                              <div className="rounded-md bg-muted/40 p-2 space-y-1">
                                {order.email && (
                                  <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <Mail className="size-3 shrink-0" />
                                    <span className="truncate">{order.email}</span>
                                  </div>
                                )}
                                {order.phone_number && (
                                  <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <Phone className="size-3 shrink-0" />
                                    <span>{order.phone_number}</span>
                                  </div>
                                )}
                                {(order.town || order.county) && (
                                  <div className="flex items-start gap-1.5 text-muted-foreground">
                                    <MapPin className="size-3 shrink-0 mt-0.5" />
                                    <span>
                                      {[order.street_address, order.town, order.county]
                                        .filter(Boolean)
                                        .join(", ")}
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Order items if available */}
                              {order.items && order.items.length > 0 && (
                                <div className="space-y-1">
                                  <p className="font-semibold text-foreground text-[10px] uppercase tracking-wider">
                                    Items
                                  </p>
                                  <ul className="divide-y divide-border/40">
                                    {order.items.map((it) => (
                                      <li
                                        key={it.id}
                                        className="py-1 flex items-baseline justify-between gap-2"
                                      >
                                        <span className="truncate text-muted-foreground">
                                          <span className="font-semibold text-foreground">
                                            {it.quantity}×
                                          </span>{" "}
                                          {it.product_title}
                                        </span>
                                        <span className="shrink-0 font-medium tabular-nums">
                                          Ksh {money(it.line_total)}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {orders.count > orders.results.length && (
                      <p className="pt-1 text-center text-[11px] text-muted-foreground">
                        Showing the latest {orders.results.length} of {orders.count}
                      </p>
                    )}
                  </>
                )}
              </div>
              <SheetFooter className="border-t">
                <Button variant="outline" className="w-full" asChild onClick={() => setOrdersSheetOpen(false)}>
                  <Link href="/admin/orders">
                    Open orders page
                  </Link>
                </Button>
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
                onClick={() => {
                  // Seed the form from the current session (event handler,
                  // not an effect).
                  setProfileName(user?.display_name || "");
                  setProfilePhone(user?.phone_number || "");
                  setProfileEmail(user?.email || "");
                  setShowSettingsDialog(true);
                }}
                className="cursor-pointer"
              >
                <Settings className="size-4" />
                <span>Account Settings</span>
              </DropdownMenuItem>
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

      {/* Account Settings Dialog (Profile + Security/Password) */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Account Settings</DialogTitle>
            <DialogDescription>
              Manage your account profile and security credentials.
            </DialogDescription>
          </DialogHeader>

          {/* Tab selector */}
          <div className="flex border-b border-border/60 text-xs">
            <button
              type="button"
              onClick={() => setSettingsTab("profile")}
              className={`flex items-center gap-1.5 pb-2 pt-1 font-medium border-b-2 transition-colors cursor-pointer mr-4 ${
                settingsTab === "profile"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <User className="size-3.5" />
              Profile Details
            </button>
            <button
              type="button"
              onClick={() => setSettingsTab("security")}
              className={`flex items-center gap-1.5 pb-2 pt-1 font-medium border-b-2 transition-colors cursor-pointer ${
                settingsTab === "security"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <KeyRound className="size-3.5" />
              Password & Security
            </button>
          </div>

          {settingsTab === "profile" ? (
            <form onSubmit={handleSaveProfile} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="profile-name">Display Name</Label>
                <Input
                  id="profile-name"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="e.g. John Doe"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-email">Email Address</Label>
                <Input
                  id="profile-email"
                  type="email"
                  value={profileEmail}
                  onChange={(e) => setProfileEmail(e.target.value)}
                  placeholder="name@example.com"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-phone">Phone Number</Label>
                <Input
                  id="profile-phone"
                  value={profilePhone}
                  onChange={(e) => setProfilePhone(e.target.value)}
                  placeholder="e.g. 0712345678"
                />
              </div>
              <DialogFooter className="mt-4 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={savingProfile}
                  onClick={() => setShowSettingsDialog(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={savingProfile}>
                  {savingProfile ? "Saving…" : "Save Profile"}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <form onSubmit={handleSavePassword} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="old-password">Current Password</Label>
                <Input
                  id="old-password"
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              <DialogFooter className="mt-4 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={savingPassword}
                  onClick={() => setShowSettingsDialog(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={savingPassword}>
                  {savingPassword ? "Updating…" : "Update Password"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Sign Out</DialogTitle>
            <DialogDescription>Are you sure you want to sign out?</DialogDescription>
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
