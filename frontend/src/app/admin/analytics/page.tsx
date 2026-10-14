"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Coins,
  Download,
  MapPin,
  RefreshCw,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { AnimatedNumber } from "@/components/ui/animated-number";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, PageHeader } from "@/components/ui/states";
import { api } from "@/lib/api";
import { formatKsh } from "@/lib/store-api";
import { useQuery } from "@/lib/use-query";
import type { AnalyticsData } from "@/lib/types";

type PresetPeriod = "7d" | "30d" | "90d" | "month" | "year" | "all";

const PERIOD_LABELS: Record<PresetPeriod, string> = {
  "7d": "Last 7 Days",
  "30d": "Last 30 Days",
  "90d": "Last 90 Days",
  month: "This Month",
  year: "This Year",
  all: "All Time",
};

const STATUS_COLORS: Record<string, string> = {
  PROCESSING: "var(--gold)",
  CONFIRMED: "var(--chart-2)",
  DELIVERED: "var(--chart-4)",
  CANCELLED: "var(--destructive)",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cod: "Cash on Delivery",
  mpesa: "Lipa na M-Pesa",
};

// Count-up formatters for AnimatedNumber: mid-flight frames round for a
// clean roll, the resting frame returns the exact target.
const formatWhole = (n: number) => n.toLocaleString();
const formatOrderWord = (n: number) =>
  `${Math.round(n)} order${Math.round(n) === 1 ? "" : "s"}`;
const formatUnitWord = (n: number) =>
  `${Math.round(n)} unit${Math.round(n) === 1 ? "" : "s"} sold`;
const money = (target: number) => (n: number) =>
  formatKsh(n === target ? target : Math.round(n));
const percent = (target: number) => (n: number) =>
  `${n === target ? target : Math.round(n * 10) / 10}%`;

function formatCompact(value: number): string {
  if (value >= 1000) {
    const k = value / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return String(value);
}

function formatDay(iso: string): string {
  if (iso.includes(":")) return iso;
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-KE", {
    month: "short",
    day: "numeric",
  });
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<PresetPeriod>("30d");
  // Reserved for a future custom date-range picker; no UI writes them yet.
  const [customStart] = useState("");
  const [customEnd] = useState("");
  const [useCustomRange, setUseCustomRange] = useState(false);

  const queryUrl =
    useCustomRange && customStart && customEnd
      ? `/api/v1/admin/analytics/?start_date=${customStart}&end_date=${customEnd}`
      : `/api/v1/admin/analytics/?period=${period}`;

  // Without these deps the selector would update state but never re-request.
  const { data, error, loading, refetch } = useQuery<AnalyticsData>(
    () => api.get<AnalyticsData>(queryUrl),
    [queryUrl],
  );

  const kpis = data?.kpis;
  const timeline = data?.timeline ?? [];
  const statusDistribution = data?.status_distribution ?? [];
  const paymentMethods = data?.payment_methods ?? [];
  const topProducts = data?.top_products ?? [];
  const destinations = data?.destinations ?? [];
  const deadStock = data?.dead_stock ?? [];

  const handleExportCsv = () => {
    if (!data) return;
    try {
      const rows = [
        ["Date", "Revenue (Ksh)", "Orders"],
        ...timeline.map((t) => [
          t.date,
          t.revenue.toString(),
          t.orders.toString(),
        ]),
      ];
      const csvContent =
        "data:text/csv;charset=utf-8," +
        rows.map((e) => e.join(",")).join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute(
        "download",
        `wayaz_analytics_${data.start_date}_to_${data.end_date}.csv`,
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Analytics CSV exported successfully.");
    } catch {
      toast.error("Failed to generate CSV export.");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics & Reports"
        description="In-depth financial performance, customer retention, fulfillment health, and catalog insights."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center rounded-lg border border-border/60 bg-muted/40 p-0.5 text-xs">
          {(["7d", "30d", "90d", "month", "year", "all"] as PresetPeriod[]).map(
            (tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setUseCustomRange(false);
                  setPeriod(tab);
                }}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                  !useCustomRange && period === tab
                    ? "bg-card dark:bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {PERIOD_LABELS[tab]}
              </button>
            ),
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={!data || loading}
            className="h-8 gap-1.5 text-xs font-medium cursor-pointer"
          >
            <Download className="size-3.5" />
            Export CSV
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            disabled={loading}
            className="size-8"
            title="Refresh"
          >
            <RefreshCw
              className={`size-3.5 ${loading ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={refetch} />}

      {loading && !data && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-xl" />
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-72 rounded-xl" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        </div>
      )}

      {kpis && data && (
        // Wrapping the report keeps the previous numbers visible (dimmed)
        // while a new period loads.
        <div
          aria-busy={loading}
          className={`space-y-6 transition-opacity ${
            loading ? "opacity-60" : "opacity-100"
          }`}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Gross Revenue
                </p>
                <Coins className="size-4 text-gold" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold tracking-tight tabular-nums">
                  <AnimatedNumber
                    value={kpis.gross_sales}
                    decimals={2}
                    formatter={money(kpis.gross_sales)}
                  />
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Across{" "}
                  <AnimatedNumber
                    value={kpis.total_orders}
                    formatter={formatWhole}
                  />{" "}
                  total orders
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Average Order Value
                </p>
                <TrendingUp className="size-4 text-primary" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold tracking-tight tabular-nums">
                  <AnimatedNumber
                    value={kpis.aov}
                    decimals={2}
                    formatter={money(kpis.aov)}
                  />
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Average gross customer basket spend
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Fulfillment Rate
                </p>
                <CheckCircle2 className="size-4 text-emerald-600" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold tracking-tight tabular-nums">
                  <AnimatedNumber
                    value={kpis.fulfillment_rate}
                    decimals={1}
                    formatter={percent(kpis.fulfillment_rate)}
                  />
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  <AnimatedNumber
                    value={kpis.completed_orders}
                    formatter={formatWhole}
                  />{" "}
                  orders delivered safely
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Repeat Customer Rate
                </p>
                <Users className="size-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold tracking-tight tabular-nums">
                  <AnimatedNumber
                    value={kpis.repeat_customer_rate}
                    decimals={1}
                    formatter={percent(kpis.repeat_customer_rate)}
                  />
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Customers with 2+ purchases
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base font-bold">
                    Revenue & Order Volume Trend
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Daily trajectory for period ({data.start_date} to{" "}
                    {data.end_date})
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-primary" />
                    Revenue (Ksh)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-gold" />
                    Order Count
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {timeline.length === 0 ? (
                <EmptyState
                  title="No timeline data"
                  hint="Order metrics will plot here once transactions occur."
                />
              ) : (
                <div className="h-72 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={timeline}
                      margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
                    >
                      <defs>
                        <linearGradient
                          id="analyticsRevFill"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="#e00613"
                            stopOpacity={0.35}
                          />
                          <stop
                            offset="100%"
                            stopColor="#e00613"
                            stopOpacity={0.01}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        vertical={false}
                        stroke="var(--border)"
                        strokeDasharray="3 3"
                      />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatDay}
                        minTickGap={28}
                        tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        yAxisId="left"
                        tickFormatter={formatCompact}
                        tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                        tickLine={false}
                        axisLine={false}
                        width={46}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                        tickLine={false}
                        axisLine={false}
                        width={28}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const point = payload[0].payload as {
                            date: string;
                            revenue: number;
                            orders: number;
                          };
                          return (
                            <div className="rounded-lg border border-border/60 bg-popover px-3 py-2 text-xs shadow-lg">
                              <p className="mb-1 font-semibold text-foreground">
                                {formatDay(point.date)}
                              </p>
                              <p className="text-muted-foreground">
                                Revenue:{" "}
                                <span className="font-semibold text-foreground">
                                  {formatKsh(point.revenue)}
                                </span>
                              </p>
                              <p className="text-muted-foreground">
                                Orders:{" "}
                                <span className="font-semibold text-foreground">
                                  {point.orders}
                                </span>
                              </p>
                            </div>
                          );
                        }}
                      />
                      <Area
                        yAxisId="left"
                        type="monotone"
                        dataKey="revenue"
                        stroke="#e00613"
                        strokeWidth={2.5}
                        fill="url(#analyticsRevFill)"
                      />
                      <Bar
                        yAxisId="right"
                        dataKey="orders"
                        fill="var(--gold)"
                        opacity={0.7}
                        radius={[4, 4, 0, 0]}
                        maxBarSize={28}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-bold">
                  Order Status Pipeline
                </CardTitle>
                <CardDescription className="text-xs">
                  Distribution of orders by active fulfillment stage
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 pt-2">
                  {statusDistribution.map((item) => {
                    const total = kpis.total_orders || 1;
                    const pct = Math.round((item.count / total) * 100);
                    return (
                      <div key={item.status} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-foreground">
                            {item.label}
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            <AnimatedNumber
                              value={item.count}
                              formatter={(n) =>
                                `${n} (${Math.round((n / total) * 100)}%)`
                              }
                            />
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${pct}%`,
                              backgroundColor:
                                STATUS_COLORS[item.status] || "var(--primary)",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-bold">
                  Payment Channels
                </CardTitle>
                <CardDescription className="text-xs">
                  Breakdown by customer checkout preference
                </CardDescription>
              </CardHeader>
              <CardContent>
                {paymentMethods.length === 0 ? (
                  <EmptyState
                    title="No payment records"
                    hint="Payment breakdown will appear with your first orders."
                  />
                ) : (
                  <div className="space-y-3 pt-2">
                    {paymentMethods.map((pm) => (
                      <div
                        key={pm.payment_method}
                        className="flex items-center justify-between rounded-xl border border-border/60 p-3 text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold">
                            {pm.payment_method === "mpesa" ? "M" : "C"}
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">
                              {PAYMENT_METHOD_LABELS[pm.payment_method] ||
                                pm.payment_method}
                            </p>
                            <p className="text-muted-foreground text-[11px]">
                              <AnimatedNumber
                                value={pm.count}
                                formatter={formatOrderWord}
                              />
                            </p>
                          </div>
                        </div>
                        <span className="font-bold tabular-nums text-sm text-foreground">
                          <AnimatedNumber
                            value={pm.volume || 0}
                            decimals={2}
                            formatter={money(pm.volume || 0)}
                          />
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-bold">
                  Top Revenue Drivers
                </CardTitle>
                <CardDescription className="text-xs">
                  Products generating the most gross sales in this period
                </CardDescription>
              </CardHeader>
              <CardContent>
                {topProducts.length === 0 ? (
                  <EmptyState
                    title="No sales yet"
                    hint="Top selling products will rank here."
                  />
                ) : (
                  <ul className="flex flex-col pt-1">
                    {topProducts.map((p, idx) => (
                      <li
                        key={p.product_id}
                        className={`flex items-center justify-between gap-3 text-xs py-2.5 ${
                          idx === topProducts.length - 1
                            ? ""
                            : "border-b border-border/60"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`flex size-6 shrink-0 items-center justify-center rounded-md font-bold text-[11px] tabular-nums ${
                              idx === 0
                                ? "bg-gold text-black"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            #{idx + 1}
                          </span>
                          <div className="min-w-0">
                            <Link
                              href={`/admin/products/${p.product_id}`}
                              className="font-medium text-foreground hover:text-primary transition-colors truncate block"
                            >
                              {p.title}
                            </Link>
                            <p className="text-muted-foreground text-[11px]">
                              <AnimatedNumber
                                value={p.units_sold}
                                formatter={formatUnitWord}
                              />
                            </p>
                          </div>
                        </div>
                        <span className="font-semibold tabular-nums text-foreground shrink-0">
                          <AnimatedNumber
                            value={p.revenue}
                            decimals={2}
                            formatter={money(p.revenue)}
                          />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-bold">
                  Top Delivery Destinations
                </CardTitle>
                <CardDescription className="text-xs">
                  Geographic distribution across Kenya
                </CardDescription>
              </CardHeader>
              <CardContent>
                {destinations.length === 0 ? (
                  <EmptyState
                    title="No destination data"
                    hint="County delivery distribution appears after orders."
                  />
                ) : (
                  <ul className="flex flex-col pt-1">
                    {destinations.map((d, idx) => (
                      <li
                        key={d.county}
                        className={`flex items-center justify-between text-xs py-2.5 ${
                          idx === destinations.length - 1
                            ? ""
                            : "border-b border-border/60"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <MapPin className="size-3.5 text-muted-foreground shrink-0" />
                          <span className="font-medium text-foreground">
                            {d.county}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 tabular-nums">
                          <span className="text-muted-foreground">
                            <AnimatedNumber
                              value={d.orders}
                              formatter={formatOrderWord}
                            />
                          </span>
                          <span className="font-semibold text-foreground">
                            <AnimatedNumber
                              value={d.volume}
                              decimals={2}
                              formatter={money(d.volume)}
                            />
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {deadStock.length > 0 && (
            <Card className="border-amber-500/20 bg-amber-500/5">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-amber-600" />
                  <CardTitle className="text-base font-bold text-foreground">
                    Slow-Moving Inventory Alert
                  </CardTitle>
                </div>
                <CardDescription className="text-xs">
                  The following stocked products had 0 sales in the selected
                  period. Consider promotional campaigns or discount bundling.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 pt-1">
                  {deadStock.map((prod) => (
                    <div
                      key={prod.id}
                      className="flex items-center justify-between rounded-lg border border-border/60 bg-background p-3 text-xs"
                    >
                      <div className="min-w-0 pr-2">
                        <Link
                          href={`/admin/products/${prod.id}`}
                          className="font-medium text-foreground hover:text-primary transition-colors truncate block"
                        >
                          {prod.title}
                        </Link>
                        <p className="text-muted-foreground text-[11px] mt-0.5">
                          {formatKsh(prod.base_price)}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 font-bold tabular-nums text-foreground">
                        {prod.stock_quantity} left
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
