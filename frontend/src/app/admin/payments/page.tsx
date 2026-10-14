"use client";

import { useState } from "react";
import { Banknote, Smartphone } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ListPagination } from "@/components/ui/pagination";
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
import { EmptyState, ErrorState, PageHeader } from "@/components/ui/states";
import { FilterSearch, FilterToolbar } from "@/components/admin/filter-toolbar";
import { api } from "@/lib/api";
import { formatKsh } from "@/lib/store-api";
import { useQuery } from "@/lib/use-query";

type PaymentMethodFilter = "all" | "mpesa" | "cod";
type PaymentStatusFilter = "all" | "COMPLETED" | "PENDING" | "FAILED";

interface PaymentEntry {
  id: string;
  type: "mpesa" | "cod";
  order_number: string;
  amount: string;
  phone: string;
  status: "COMPLETED" | "PENDING" | "FAILED";
  reference: string;
  note: string;
  date: string;
}

interface PaymentsResponse {
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  results: PaymentEntry[];
}

const PAGE_SIZE = 10;

const METHOD_OPTIONS: { value: PaymentMethodFilter; label: string }[] = [
  { value: "all", label: "All Methods" },
  { value: "mpesa", label: "M-Pesa" },
  { value: "cod", label: "Cash on Delivery" },
];

const STATUS_OPTIONS: { value: PaymentStatusFilter; label: string }[] = [
  { value: "all", label: "All Statuses" },
  { value: "COMPLETED", label: "Paid" },
  { value: "PENDING", label: "Pending" },
  { value: "FAILED", label: "Failed / Cancelled" },
];

const STATUS_BADGE_VARIANT: Record<
  string,
  "success" | "warning" | "destructive" | "secondary"
> = {
  COMPLETED: "success",
  PENDING: "warning",
  FAILED: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  COMPLETED: "Paid",
  PENDING: "Pending",
  FAILED: "Failed",
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

export default function AdminPaymentsPage() {
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState<PaymentMethodFilter>("all");
  const [statusFilter, setStatusFilter] = useState<PaymentStatusFilter>("all");
  const [page, setPage] = useState(1);

  const buildUrl = () => {
    const params = new URLSearchParams();
    if (method !== "all") params.set("method", method);
    if (statusFilter !== "all") params.set("status", statusFilter);
    params.set("page", String(page));
    params.set("page_size", String(PAGE_SIZE));
    return `/api/v1/admin/orders/payments/?${params}`;
  };

  const { data, loading, error, refetch } = useQuery<PaymentsResponse>(
    () => api.get<PaymentsResponse>(buildUrl()),
    [method, statusFilter, page],
  );

  const rows = search.trim()
    ? (data?.results ?? []).filter(
        (p) =>
          p.order_number.toLowerCase().includes(search.toLowerCase()) ||
          p.phone.includes(search) ||
          p.reference.toLowerCase().includes(search.toLowerCase()),
      )
    : (data?.results ?? []);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Finance"
        title="Payments"
        description={data ? `${data.count} total transactions` : undefined}
      />

      <FilterToolbar
        search={
          <FilterSearch
            value={search}
            onValueChange={setSearch}
            placeholder="Search order #, phone, receipt…"
          />
        }
        filters={
          <>
            <Select
              value={method}
              onValueChange={(val) => {
                setMethod(val as PaymentMethodFilter);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[150px] h-9 text-xs">
                <SelectValue placeholder="Method" />
              </SelectTrigger>
              <SelectContent>
                {METHOD_OPTIONS.map((opt) => (
                  <SelectItem
                    key={opt.value}
                    value={opt.value}
                    className="text-xs"
                  >
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={statusFilter}
              onValueChange={(val) => {
                setStatusFilter(val as PaymentStatusFilter);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[150px] h-9 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem
                    key={opt.value}
                    value={opt.value}
                    className="text-xs"
                  >
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
        trailing={
          data && (
            <Badge variant="outline" className="h-9 px-3 text-xs font-mono">
              {data.count} results
            </Badge>
          )
        }
      />

      {error && <ErrorState message={error} onRetry={refetch} />}

      {loading && !data && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      )}

      {data && rows.length === 0 && (
        <EmptyState
          title={
            search || method !== "all" || statusFilter !== "all"
              ? "No matching payments"
              : "No payments yet"
          }
          hint={
            search || method !== "all" || statusFilter !== "all"
              ? "Try adjusting your filters or search query."
              : "Payment transactions will appear here once customers start checking out."
          }
        />
      )}

      {data && rows.length > 0 && (
        <>
          <div className="hidden rounded-2xl bg-card shadow-(--shadow-card) overflow-hidden md:block">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="w-[10%] font-semibold text-xs">
                    Method
                  </TableHead>
                  <TableHead className="w-[18%] font-semibold text-xs">
                    Order
                  </TableHead>
                  <TableHead className="w-[12%] font-semibold text-xs text-right">
                    Amount
                  </TableHead>
                  <TableHead className="w-[14%] font-semibold text-xs">
                    Phone
                  </TableHead>
                  <TableHead className="w-[16%] font-semibold text-xs">
                    Receipt / Reference
                  </TableHead>
                  <TableHead className="w-[12%] font-semibold text-xs">
                    Status
                  </TableHead>
                  <TableHead className="w-[18%] font-semibold text-xs text-right">
                    Date
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((tx) => (
                  <TableRow key={tx.id} className="hover:bg-muted/50">
                    <TableCell>
                      <Badge
                        variant={tx.type === "mpesa" ? "success" : "info"}
                        className="text-xs gap-1 font-medium"
                      >
                        {tx.type === "mpesa" ? (
                          <Smartphone className="size-3" />
                        ) : (
                          <Banknote className="size-3" />
                        )}
                        {tx.type === "mpesa" ? "M-Pesa" : "COD"}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <span className="font-semibold text-sm tabular-nums text-foreground">
                        {tx.order_number}
                      </span>
                      {tx.note && (
                        <p className="text-xs text-muted-foreground truncate">
                          {tx.note}
                        </p>
                      )}
                    </TableCell>

                    <TableCell className="text-right font-semibold tabular-nums text-sm">
                      Ksh {formatKsh(tx.amount)}
                    </TableCell>

                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {tx.phone}
                    </TableCell>

                    <TableCell className="font-mono text-xs">
                      {tx.reference ? (
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                          {tx.reference}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>

                    <TableCell>
                      <Badge
                        variant={STATUS_BADGE_VARIANT[tx.status] ?? "secondary"}
                        className="text-xs font-medium"
                      >
                        {STATUS_LABEL[tx.status] ?? tx.status}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-right text-xs text-muted-foreground">
                      {formatDate(tx.date)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="md:hidden space-y-3">
            {rows.map((tx) => (
              <Card key={tx.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-semibold text-sm tabular-nums">
                      {tx.order_number}
                    </span>
                    <p className="text-xs text-muted-foreground font-mono">
                      {tx.phone}
                    </p>
                  </div>
                  <Badge
                    variant={STATUS_BADGE_VARIANT[tx.status] ?? "secondary"}
                    className="text-xs"
                  >
                    {STATUS_LABEL[tx.status] ?? tx.status}
                  </Badge>
                </div>

                <div className="mt-3 flex items-center justify-between border-t pt-2 text-xs">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    {tx.type === "mpesa" ? (
                      <Smartphone className="size-3" />
                    ) : (
                      <Banknote className="size-3" />
                    )}
                    {tx.type === "mpesa" ? "M-Pesa" : "COD"}
                    {tx.reference && (
                      <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 ml-1">
                        · {tx.reference}
                      </span>
                    )}
                  </div>
                  <span className="font-semibold tabular-nums text-foreground">
                    Ksh {formatKsh(tx.amount)}
                  </span>
                </div>
              </Card>
            ))}
          </div>

          <ListPagination
            page={page}
            count={data.count}
            pageSize={PAGE_SIZE}
            itemCount={rows.length}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
