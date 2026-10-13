"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  ClipboardList,
  LogIn,
  MessageCircle,
  Printer,
  RotateCcw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/admin/states";
import { useAuth } from "@/lib/auth-context";
import { useStore } from "@/components/store/store-context";
import { useQuery } from "@/lib/use-query";
import {
  fetchOrders,
  formatKsh,
  type OrderStatus,
  type StoreOrder,
} from "@/lib/store";
import type { Paginated } from "@/lib/types";

/** Server page size for GET /api/v1/orders/. */
const PAGE_SIZE = 10;

/** Status pill styling per pipeline stage (matches Badge variants). */
const STATUS_VARIANT: Record<
  OrderStatus,
  "warning" | "success" | "info" | "destructive"
> = {
  PROCESSING: "warning",
  CONFIRMED: "info",
  DELIVERED: "success",
  CANCELLED: "destructive",
};

function formatOrderedAt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function OrdersSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
          <div className="mt-4 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

const ORDER_STEPS: Array<{ key: OrderStatus; label: string }> = [
  { key: "PROCESSING", label: "Processing" },
  { key: "CONFIRMED", label: "Confirmed" },
  { key: "DELIVERED", label: "Delivered" },
];

function OrderProgressTimeline({ status }: { status: OrderStatus }) {
  if (status === "CANCELLED") {
    return (
      <div className="my-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-center justify-between">
        <span className="font-semibold">Order Cancelled</span>
        <span>This order was cancelled and will not be fulfilled.</span>
      </div>
    );
  }

  const currentIdx = ORDER_STEPS.findIndex((s) => s.key === status);
  const activeIdx = currentIdx === -1 ? 0 : currentIdx;

  return (
    <div className="my-4 px-1" aria-label="Order status timeline">
      <div className="relative flex items-center justify-between">
        {/* Connecting track line */}
        <div
          aria-hidden="true"
          className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 w-full bg-border"
        />
        {/* Active progress track */}
        <div
          aria-hidden="true"
          className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 bg-primary transition-all duration-300"
          style={{
            width: `${(activeIdx / (ORDER_STEPS.length - 1)) * 100}%`,
          }}
        />

        {ORDER_STEPS.map((step, idx) => {
          const isDone = idx < activeIdx;
          const isCurrent = idx === activeIdx;
          return (
            <div
              key={step.key}
              className="relative z-10 flex flex-col items-center group"
            >
              <div
                className={`flex size-6 items-center justify-center rounded-full border-2 text-[10px] font-bold transition-all duration-200 ${
                  isDone
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : isCurrent
                      ? "border-primary bg-card dark:bg-background text-primary shadow-xs"
                      : "border-muted-foreground/30 bg-muted text-muted-foreground"
                }`}
              >
                {isDone ? "✓" : idx + 1}
              </div>
              <span
                className={`mt-1.5 text-[11px] font-medium leading-tight select-none ${
                  isCurrent
                    ? "text-primary font-semibold"
                    : isDone
                      ? "text-foreground"
                      : "text-muted-foreground"
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** One order: header (number + status), timeline stepper, line items, totals, delivery. */
function OrderCard({
  order,
  printing,
  onPrint,
}: {
  order: StoreOrder;
  printing: boolean;
  onPrint: () => void;
}) {
  return (
    <article
      className={`rounded-2xl border bg-card overflow-hidden shadow-xs${
        printing ? " print-target" : ""
      }`}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-4 py-3 bg-muted/20">
        <div className="flex items-center gap-2">
          <ClipboardList className="size-4 text-gold" aria-hidden="true" />
          <span className="text-sm font-semibold tabular-nums">
            {order.order_number}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <time
            dateTime={order.created_at}
            className="text-xs text-muted-foreground tabular-nums"
          >
            {formatOrderedAt(order.created_at)}
          </time>
          <Badge variant={STATUS_VARIANT[order.status]}>
            {order.status_display}
          </Badge>
        </div>
      </header>

      <div className="px-4 py-3">
        <OrderProgressTimeline status={order.status} />

        <ul className="space-y-1.5 pt-1">
          {order.items.map((item) => (
            <li
              key={item.id}
              className="flex items-baseline justify-between gap-3 text-sm"
            >
              <span className="min-w-0 truncate">
                <span className="font-medium tabular-nums">
                  {item.quantity}×
                </span>{" "}
                {item.product_title}
                {/* Re-pick the size on the product page (order items don't
                    store size snapshots). */}
                {item.product_slug && (
                  <Link
                    href={`/products/${item.product_slug}`}
                    className="ml-2 inline-flex items-center gap-1 align-middle text-xs font-medium text-primary hover:underline print:hidden"
                  >
                    <RotateCcw className="size-3" aria-hidden="true" />
                    Buy again
                  </Link>
                )}
              </span>
              <span className="shrink-0 text-muted-foreground tabular-nums">
                Ksh {formatKsh(item.line_total)}
              </span>
            </li>
          ))}
        </ul>

        <dl className="mt-3 space-y-1 border-t pt-3 text-xs text-muted-foreground">
          <div className="flex justify-between gap-3">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">Ksh {formatKsh(order.subtotal)}</dd>
          </div>
          {Number(order.discount_amount) > 0 && (
            <div className="flex justify-between gap-3">
              <dt>Discount</dt>
              <dd className="tabular-nums text-primary">
                − Ksh {formatKsh(order.discount_amount)}
              </dd>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <dt>Delivery</dt>
            <dd className="tabular-nums">
              {Number(order.shipping_fee) > 0
                ? `Ksh ${formatKsh(order.shipping_fee)}`
                : "Free"}
            </dd>
          </div>
          <div className="flex justify-between gap-3 text-sm font-semibold text-foreground">
            <dt>Total</dt>
            <dd className="tabular-nums">Ksh {formatKsh(order.total_amount)}</dd>
          </div>
        </dl>

        <p className="mt-3 text-xs text-muted-foreground">
          {order.shipping_name} · {order.town}, {order.county} ·{" "}
          {order.payment_method_display}
        </p>
      </div>

      <footer className="border-t px-4 py-3 bg-muted/10 print:hidden">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <a
            href={order.whatsapp_link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gold outline-none transition-colors hover:text-primary"
          >
            <MessageCircle className="size-3.5" aria-hidden="true" />
            Follow up on WhatsApp
          </a>
          <button
            type="button"
            onClick={onPrint}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground cursor-pointer"
          >
            <Printer className="size-3.5" aria-hidden="true" />
            Print receipt
          </button>
        </div>
      </footer>
    </article>
  );
}

/**
 * Account order history behind Account → Orders; signed-out visitors get the
 * store's in-place login dialog instead of a redirect.
 */
export function OrdersView() {
  const { ready, isAuthenticated } = useAuth();
  const { openLogin } = useStore();
  const [page, setPage] = useState(1);
  // Order currently styled for the browser print dialog (receipt).
  const [printingId, setPrintingId] = useState<number | null>(null);

  // Release the print-target marker once the dialog closes.
  useEffect(() => {
    const clear = () => setPrintingId(null);
    window.addEventListener("afterprint", clear);
    return () => window.removeEventListener("afterprint", clear);
  }, []);

  // Open the browser dialog once the target class has painted.
  useEffect(() => {
    if (printingId !== null) window.print();
  }, [printingId]);

  // Skips the network while signed out; fetches as soon as isAuthenticated
  // flips (i.e. right after the login dialog).
  const { data, error, loading, refetch } = useQuery<
    Paginated<StoreOrder> | null
  >(
    () => (isAuthenticated ? fetchOrders(page, PAGE_SIZE) : Promise.resolve(null)),
    [page, isAuthenticated],
  );

  const orders = data?.results ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.count ?? 0) / PAGE_SIZE));

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        <Link
          href="/"
          className="rounded-sm outline-none transition-colors hover:text-foreground"
        >
          Home
        </Link>
        <ChevronRight className="size-3.5" aria-hidden="true" />
        <span className="font-medium text-foreground">Orders</span>
      </nav>

      <div className="mt-4">
        <p className="text-xs font-semibold tracking-[0.2em] text-gold uppercase">
          Your account
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          Orders
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every order you&apos;ve placed with your account, newest first.
        </p>
      </div>

      <div className="mt-6">
        {!ready || (isAuthenticated && loading && !data) ? (
          <OrdersSkeleton />
        ) : !isAuthenticated ? (
          <EmptyState
            title="Sign in to see your orders"
            hint="Your order history is tied to your Wayaz account."
            action={
              <Button size="sm" onClick={openLogin} className="gap-1.5">
                <LogIn className="size-4" aria-hidden="true" />
                Sign In
              </Button>
            }
          />
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : orders.length === 0 ? (
          <EmptyState
            title="No orders yet"
            hint="When you place an order it will show up here with live status updates."
            action={
              <Button asChild size="sm" variant="outline">
                <Link href="/">Start shopping</Link>
              </Button>
            }
          />
        ) : (
          <>
            <div className="space-y-4">
              {orders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  printing={printingId === order.id}
                  onPrint={() => setPrintingId(order.id)}
                />
              ))}
            </div>

            {data && data.count > 0 && (
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground tabular-nums">
                  Showing {(page - 1) * PAGE_SIZE + 1}–
                  {(page - 1) * PAGE_SIZE + orders.length} of{" "}
                  {data.count.toLocaleString()}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="h-8 text-xs cursor-pointer"
                  >
                    Previous
                  </Button>
                  <span className="min-w-10 text-center text-xs font-medium text-muted-foreground tabular-nums">
                    {page}/{totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="h-8 text-xs cursor-pointer"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
