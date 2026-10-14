"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { formatKsh } from "@/lib/store-api";
import type { AdminOrdersResponse } from "@/lib/types";

const ORDER_STATUSES: Array<[string, string]> = [
  ["PROCESSING", "Processing"],
  ["CONFIRMED", "Confirmed"],
  ["DELIVERED", "Delivered"],
  ["CANCELLED", "Cancelled"],
];

export function OrdersSheet() {
  const [orders, setOrders] = useState<AdminOrdersResponse | null>(null);
  const [fetching, setFetching] = useState(false);
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [expandedOrderNumber, setExpandedOrderNumber] = useState<string | null>(null);
  const [updatingOrderNumber, setUpdatingOrderNumber] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const search = query.trim();
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search) params.set("search", search);
      setFetching(true);
      api
        .get<AdminOrdersResponse>(`/api/v1/admin/orders/?${params.toString()}`)
        .then((res) => {
          if (active) setOrders(res);
        })
        .catch(() => {
          // Keep the last good snapshot; an empty sheet beats a broken header.
        })
        .finally(() => {
          if (active) setFetching(false);
        });
    }, search ? 250 : 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [statusFilter, query]);

  const handleQuickStatusChange = async (orderNumber: string, nextStatus: string) => {
    setUpdatingOrderNumber(orderNumber);
    try {
      await api.patch(`/api/v1/admin/orders/${orderNumber}/`, {
        status: nextStatus,
      });
      toast.success(`Order #${orderNumber} updated to ${nextStatus.replace(/_/g, " ")}`);
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

  return (
    <Sheet open={open} onOpenChange={setOpen}>
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
                  statusFilter !== "all" || query.trim() ? "matching" : "total"
                }`
              : "Loading…"}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-2 border-b px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search order #, name or email…"
              aria-label="Search orders"
              className="h-9 pl-8 pr-8"
            />
            {fetching && (
              <Loader2 className="absolute right-2.5 top-1/2 size-3 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-full" aria-label="Filter by status">
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
              {statusFilter === "all" && !query.trim()
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
                        Ksh {formatKsh(order.total_amount)}
                      </span>
                    </div>

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

                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-border/60 space-y-2 text-[11px] animate-in fade-in-0 duration-200">
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
                                    Ksh {formatKsh(it.line_total)}
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
          <Button variant="outline" className="w-full" asChild onClick={() => setOpen(false)}>
            <Link href="/admin/orders">
              Open orders page
            </Link>
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
