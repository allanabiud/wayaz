"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, ClipboardList, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ListPagination } from "@/components/ui/list-pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, ErrorState, PageHeader } from "@/components/admin/states";
import { FilterSearch, FilterToolbar } from "@/components/admin/filter-toolbar";
import { api, ApiError } from "@/lib/api";
import { formatKsh } from "@/lib/store";
import { useQuery } from "@/lib/use-query";
import type { AdminOrder, AdminOrdersResponse } from "@/lib/types";

const PAGE_SIZE = 10;

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "pending", label: "Pending (Needs Action)" },
  { value: "PROCESSING", label: "Processing" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "CANCELLED", label: "Cancelled" },
];

const STATUS_BADGE_VARIANT: Record<
  string,
  "warning" | "success" | "info" | "destructive" | "secondary"
> = {
  PROCESSING: "warning",
  CONFIRMED: "info",
  DELIVERED: "success",
  CANCELLED: "destructive",
};

const STATUS_LABELS: Record<string, string> = {
  PROCESSING: "Processing",
  CONFIRMED: "Confirmed",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString("en-KE", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

export default function AdminOrdersPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const queryParams = new URLSearchParams();
  queryParams.set("page", String(page));
  queryParams.set("page_size", String(PAGE_SIZE));
  if (statusFilter !== "all") {
    queryParams.set("status", statusFilter);
  }
  if (search.trim()) {
    queryParams.set("search", search.trim());
  }

  const { data, error, loading, refetch } = useQuery<AdminOrdersResponse>(
    () => api.get<AdminOrdersResponse>(`/api/v1/admin/orders/?${queryParams.toString()}`),
    [page, statusFilter, search],
  );

  const handleStatusChange = async (orderNumber: string, nextStatus: string) => {
    setUpdatingStatus(true);
    try {
      await api.patch(`/api/v1/admin/orders/${orderNumber}/`, {
        status: nextStatus,
      });
      toast.success(
        `Order ${orderNumber} updated to ${STATUS_LABELS[nextStatus] ?? nextStatus}.`,
      );
      if (selectedOrder && selectedOrder.order_number === orderNumber) {
        setSelectedOrder((prev) =>
          prev ? { ...prev, status: nextStatus, status_display: nextStatus } : null,
        );
      }
      refetch();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to update status.",
      );
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Fulfillment"
        title="Orders"
        description={
          data
            ? `${data.count} total orders (${data.pending_count} pending fulfillment)`
            : undefined
        }
      />

      <FilterToolbar
        search={
          <FilterSearch
            value={search}
            onValueChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            onClear={() => {
              setSearch("");
              setPage(1);
            }}
            placeholder="Search order #, customer, email, phone…"
          />
        }
        filters={
          <Select
            value={statusFilter}
            onValueChange={(val) => {
              setStatusFilter(val);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[180px] h-9 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
        trailing={
          data && (
            <>
              <Badge variant="outline" className="h-9 px-3 text-xs font-mono">
                {data.count} results
              </Badge>
              {data.pending_count > 0 && (
                <Badge variant="warning" className="h-9 px-3 text-xs">
                  {data.pending_count} pending
                </Badge>
              )}
            </>
          )
        }
      />

      {error && <ErrorState message={error} onRetry={refetch} />}

      {loading && !data && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      )}

      {data && data.results.length === 0 && (
        <EmptyState
          title={search || statusFilter !== "all" ? "No matching orders" : "No orders yet"}
          hint={
            search || statusFilter !== "all"
              ? "Try adjusting your search query or status filter."
              : "Customer orders will appear here once placed on the storefront."
          }
        />
      )}

      {data && data.results.length > 0 && (
        <>
          <div className="hidden rounded-2xl bg-card shadow-(--shadow-card) overflow-hidden md:block">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="w-[20%] font-semibold text-xs">Order</TableHead>
                  <TableHead className="w-[24%] font-semibold text-xs">Customer</TableHead>
                  <TableHead className="w-[16%] font-semibold text-xs">Status</TableHead>
                  <TableHead className="w-[14%] font-semibold text-xs">Payment</TableHead>
                  <TableHead className="w-[12%] font-semibold text-xs text-right">Total</TableHead>
                  <TableHead className="w-[14%] font-semibold text-xs text-right">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.results.map((order) => (
                  <TableRow
                    key={order.order_number}
                    className="hover:bg-muted/50 cursor-pointer"
                    onClick={() => setSelectedOrder(order)}
                  >
                    <TableCell>
                      <div className="min-w-0">
                        <span className="font-semibold text-sm tabular-nums text-foreground">
                          {order.order_number}
                        </span>
                        <p className="text-xs text-muted-foreground">
                          {order.item_count} item{order.item_count === 1 ? "" : "s"}
                        </p>
                      </div>
                    </TableCell>

                    <TableCell className="truncate text-xs">
                      <div className="font-medium text-foreground truncate">
                        {order.customer}
                      </div>
                      <div className="text-muted-foreground truncate text-[11px]">
                        {order.phone_number} · {order.town}, {order.county}
                      </div>
                    </TableCell>

                    <TableCell>
                      <Badge
                        variant={STATUS_BADGE_VARIANT[order.status] ?? "secondary"}
                        className="text-xs font-medium"
                      >
                        {order.status_display}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-xs">
                      <div className="text-foreground capitalize font-medium">
                        {order.payment_method_display}
                      </div>
                      <div className="text-muted-foreground text-[11px] capitalize">
                        {order.payment_status.toLowerCase()}
                      </div>
                    </TableCell>

                    <TableCell className="text-right text-sm font-semibold tabular-nums">
                      Ksh {formatKsh(order.total_amount)}
                    </TableCell>

                    <TableCell className="text-right text-xs text-muted-foreground">
                      {formatDate(order.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="md:hidden space-y-3">
            {data.results.map((order) => (
              <Card
                key={order.order_number}
                className="p-4 cursor-pointer"
                onClick={() => setSelectedOrder(order)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-semibold text-sm tabular-nums">
                      {order.order_number}
                    </span>
                    <p className="text-xs text-muted-foreground">{order.customer}</p>
                  </div>
                  <Badge
                    variant={STATUS_BADGE_VARIANT[order.status] ?? "secondary"}
                    className="text-xs"
                  >
                    {order.status_display}
                  </Badge>
                </div>

                <div className="mt-3 flex items-center justify-between border-t pt-2 text-xs">
                  <span className="text-muted-foreground">
                    {order.item_count} items · {order.payment_method_display}
                  </span>
                  <span className="font-semibold tabular-nums text-foreground">
                    Ksh {formatKsh(order.total_amount)}
                  </span>
                </div>
              </Card>
            ))}
          </div>

          <ListPagination
            page={page}
            count={data?.count ?? 0}
            pageSize={PAGE_SIZE}
            itemCount={data?.results.length ?? 0}
            onPageChange={setPage}
          />
        </>
      )}

      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl border bg-card p-6 shadow-xl">
            <button
              type="button"
              onClick={() => setSelectedOrder(null)}
              className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-5" />
            </button>

            <div className="flex items-center gap-3">
              <ClipboardList className="size-5 text-primary" />
              <div>
                <h2 className="font-heading text-lg font-bold">
                  {selectedOrder.order_number}
                </h2>
                <p className="text-xs text-muted-foreground">
                  Placed {formatDate(selectedOrder.created_at)}
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl bg-muted/40 p-4">
              <Label className="text-xs font-semibold text-muted-foreground uppercase">
                Update Order Status
              </Label>

              {selectedOrder.status === "PROCESSING" && (
                <div className="mt-3 flex flex-col gap-3 rounded-xl border border-emerald-600/30 bg-emerald-600/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    {selectedOrder.payment_method === "mpesa"
                      ? selectedOrder.payment_status === "PAID"
                        ? "M-Pesa payment received. Confirm to accept this order."
                        : "M-Pesa payment not received yet. Confirm only if you have verified payment."
                      : "Confirm to accept this cash-on-delivery order."}
                  </p>
                  <Button
                    size="sm"
                    disabled={updatingStatus}
                    onClick={() =>
                      handleStatusChange(selectedOrder.order_number, "CONFIRMED")
                    }
                    className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
                  >
                    <CheckCircle2 className="size-4" />
                    Confirm Order
                  </Button>
                </div>
              )}

              <div className="mt-2 flex flex-wrap gap-2">
                {(
                  ["PROCESSING", "CONFIRMED", "DELIVERED", "CANCELLED"] as const
                ).map((st) => (
                  <Button
                    key={st}
                    size="xs"
                    variant={selectedOrder.status === st ? "default" : "outline"}
                    disabled={updatingStatus || selectedOrder.status === st}
                    onClick={() => handleStatusChange(selectedOrder.order_number, st)}
                    className="text-xs cursor-pointer"
                  >
                    {STATUS_LABELS[st]}
                  </Button>
                ))}
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 text-xs">
              <div className="rounded-xl border p-3">
                <span className="font-semibold text-muted-foreground uppercase text-[10px]">
                  Customer
                </span>
                <p className="mt-1 font-medium text-sm text-foreground">
                  {selectedOrder.customer}
                </p>
                <p className="text-muted-foreground">{selectedOrder.email}</p>
                <p className="text-muted-foreground">{selectedOrder.phone_number}</p>
              </div>

              <div className="rounded-xl border p-3">
                <span className="font-semibold text-muted-foreground uppercase text-[10px]">
                  Delivery Address
                </span>
                <p className="mt-1 font-medium text-foreground">
                  {selectedOrder.street_address}
                </p>
                <p className="text-muted-foreground">
                  {selectedOrder.town}, {selectedOrder.county}
                </p>
                <p className="text-emerald-600 dark:text-emerald-400 font-medium mt-1">
                  Free Shipping
                </p>
              </div>
            </div>

            <div className="mt-4">
              <span className="text-xs font-semibold text-muted-foreground uppercase">
                Order Items ({selectedOrder.item_count})
              </span>
              <ul className="mt-2 divide-y rounded-xl border max-h-48 overflow-y-auto">
                {selectedOrder.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between p-3 text-xs"
                  >
                    <div>
                      <span className="font-medium text-foreground">
                        {item.product_title}
                      </span>
                      <p className="text-muted-foreground">
                        {item.quantity} × Ksh {formatKsh(item.unit_price)}
                      </p>
                    </div>
                    <span className="font-semibold tabular-nums">
                      Ksh {formatKsh(item.line_total)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 border-t pt-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal:</span>
                <span className="tabular-nums">
                  Ksh {formatKsh(selectedOrder.subtotal)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping:</span>
                <span className="text-emerald-600 font-medium">Free</span>
              </div>
              <div className="flex justify-between text-sm font-bold border-t pt-2">
                <span>Total:</span>
                <span className="tabular-nums">
                  Ksh {formatKsh(selectedOrder.total_amount)}
                </span>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedOrder(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
