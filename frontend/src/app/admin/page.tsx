"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Activity,
  Boxes,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Coins,
  Heart,
  Package,
  PackageCheck,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/admin/states";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@/lib/use-query";
import type { Overview, RecentActivity, TimeMetric } from "@/lib/types";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function money(value: string | number): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-KE") : String(value);
}

/** "06 Oct" label for a YYYY-MM-DD date (parsed as a local date). */
function formatDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-KE", {
    month: "short",
    day: "numeric",
  });
}

/** Compact axis label: 2500 -> "2.5k", 12000 -> "12k". */
function formatCompact(value: number): string {
  if (value >= 1000) {
    const k = value / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return String(value);
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; payload?: Record<string, unknown> }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/60 bg-popover px-3 py-2 text-xs shadow-lg">
      {label !== undefined && <p className="mb-1 font-medium text-foreground">{label}</p>}
      {payload.map((entry, i) => (
        <p key={i} className="text-muted-foreground">
          <span className="font-medium text-foreground">
            {typeof entry.value === "number" ? entry.value.toLocaleString() : entry.value}
          </span>{" "}
          {entry.name}
        </p>
      ))}
    </div>
  );
}

function RevenueTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: { date?: string; revenue?: number; orders?: number } }>;
}) {
  if (!active || !payload?.length || !payload[0]?.payload) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg border border-border/60 bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-foreground">{point.date ? formatDay(point.date) : ""}</p>
      <p className="text-muted-foreground">
        <span className="font-semibold text-foreground">Ksh {money(point.revenue ?? 0)}</span> revenue
      </p>
      <p className="text-muted-foreground">
        <span className="font-semibold text-foreground">{point.orders ?? 0}</span> order
        {(point.orders ?? 0) === 1 ? "" : "s"}
      </p>
    </div>
  );
}

function OrdersTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: { week_start?: string; orders?: number } }>;
}) {
  if (!active || !payload?.length || !payload[0]?.payload) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg border border-border/60 bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-foreground">
        Week of {point.week_start ? formatDay(point.week_start) : ""}
      </p>
      <p className="text-muted-foreground">
        <span className="font-semibold text-foreground">{point.orders ?? 0}</span> order
        {(point.orders ?? 0) === 1 ? "" : "s"}
      </p>
    </div>
  );
}

const HERO_GRADIENT =
  "linear-gradient(135deg, #e00613 0%, #b6050f 50%, #8a040b 100%)";

/** Data-accent palette cycled across category pie slices. */
const CATEGORY_COLORS = [
  "var(--chart-2)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--gold)",
  "var(--chart-3)",
  "var(--chart-1)",
];

const TODAY_LABEL = new Date().toLocaleDateString("en-KE", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

type PeriodTab = "today" | "week" | "month";
type ProductTab = "sales" | "wishlisted";

const PERIOD_LABELS: Record<PeriodTab, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
};

export default function AdminOverviewPage() {
  const { user } = useAuth();
  const [revenuePeriod, setRevenuePeriod] = useState<PeriodTab>("month");
  const [ordersPeriod, setOrdersPeriod] = useState<PeriodTab>("week");
  const [productTab, setProductTab] = useState<ProductTab>("sales");

  const { data, error, loading, refetch } = useQuery<Overview>(() =>
    api.get<Overview>("/api/v1/admin/overview/"),
  );

  const kpis = data?.kpis;
  const timeMetrics = data?.time_metrics;
  const alerts = data?.low_stock_alerts ?? [];
  const activity = data?.recent_activity ?? [];
  const topProducts = data?.top_products ?? [];
  const topWishlisted = data?.top_wishlisted ?? [];
  const salesSummary = data?.sales_summary;
  const revenueSeries = data?.revenue_series ?? [];
  const revenueSummary = data?.revenue_summary;
  const ordersSeries = data?.orders_series ?? [];
  const stockByCategory = data?.stock_by_category ?? [];
  const stockUnitsByCategory = stockByCategory.reduce((sum, cat) => sum + cat.units, 0);

  // Dynamic revenue series tied to current period
  const activeRevenueSeries =
    revenuePeriod === "today"
      ? (data?.revenue_series_today ?? [])
      : revenuePeriod === "week"
        ? (data?.revenue_series_week ?? [])
        : (data?.revenue_series_month ?? (data?.revenue_series ?? []));

  // Dynamic revenue KPI driven by timeMetrics or fallback
  const revMetric: TimeMetric | undefined = timeMetrics?.revenue[revenuePeriod];
  const displayRevenue = revMetric ? revMetric.current : (revenueSummary?.total ?? 0);
  const displayRevenueDelta = revMetric ? revMetric.percent : null;

  // Dynamic orders KPI driven by timeMetrics or fallback
  const ordMetric: TimeMetric | undefined = timeMetrics?.orders[ordersPeriod];
  const displayOrders = ordMetric ? ordMetric.current : (revenueSummary?.orders_total ?? 0);
  const displayOrdersDelta = ordMetric ? ordMetric.percent : null;

  return (
    <div className="space-y-6">
      {/* Slim Haze-style hero banner */}
      <section
        className="relative overflow-hidden rounded-2xl"
        style={{ background: HERO_GRADIENT }}
      >
        {/* dot-grid texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.7) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
        {/* glow orbs: white above, black below for depth */}
        <div className="pointer-events-none absolute -top-16 -right-12 size-56 rounded-full bg-white/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 size-48 rounded-full bg-black/25 blur-3xl" />

        <div className="relative z-10 p-5 sm:p-6 space-y-4">
          {/* Top Bar: Date & Status Chip on Left, Actions on Right */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/15 pb-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                suppressHydrationWarning
                className="inline-flex items-center gap-1.5 text-xs font-medium text-white/90"
              >
                <CalendarDays className="size-3.5 text-white/70" />
                {TODAY_LABEL}
              </span>
              <span className="text-white/30 text-xs hidden sm:inline">•</span>
              <span className="text-xs text-white/80">
                {kpis
                  ? alerts.length > 0
                    ? `${alerts.length} stock attention item${alerts.length === 1 ? "" : "s"}`
                    : "Inventory levels optimal"
                  : "Daily Store Overview"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-8 border-white/25 bg-white/10 text-white text-xs hover:bg-white/20 hover:text-white"
              >
                <Link href="/admin/analytics">View Analytics</Link>
              </Button>
              <Button asChild variant="secondary" size="sm" className="h-8 text-xs font-semibold">
                <Link href="/admin/products">Manage Products</Link>
              </Button>
            </div>
          </div>

          {/* Main Greeting & Quick Stats Grid */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between pt-0.5">
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                Welcome back, {user?.display_name || user?.username || "Admin"}
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-white/75 max-w-xl leading-relaxed">
                {kpis
                  ? `Here is your current store status across products, inventory, and registered customers.`
                  : "Overview of your catalog performance and orders."}
              </p>
            </div>

            {kpis && (
              <div className="grid grid-cols-3 gap-2 sm:gap-3 shrink-0">
                {[
                  {
                    icon: ShoppingBag,
                    label: "Active Products",
                    value: kpis.total_products.toLocaleString(),
                  },
                  {
                    icon: PackageCheck,
                    label: "Units in Stock",
                    value: kpis.total_stock_units.toLocaleString(),
                  },
                  {
                    icon: Users,
                    label: "Customers",
                    value: kpis.total_customers.toLocaleString(),
                  },
                ].map(({ icon: Icon, label, value }) => (
                  <div
                    key={label}
                    className="flex flex-col rounded-xl border border-white/15 bg-white/10 px-3.5 py-2.5 backdrop-blur-md min-w-[100px] sm:min-w-[125px]"
                  >
                    <div className="flex items-center gap-1.5 text-white/75 text-[11px]">
                      <Icon className="size-3.5 shrink-0" />
                      <span className="truncate">{label}</span>
                    </div>
                    <span className="mt-1 text-base sm:text-lg font-bold tabular-nums text-white">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {error && <ErrorState message={error} onRetry={refetch} />}

      {loading && !kpis && (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
            <Skeleton className="h-80 rounded-2xl" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-80 rounded-2xl" />
            <Skeleton className="h-80 rounded-2xl" />
          </div>
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      )}

      {kpis && (
        <>
          {/* Total Revenue chart + Stock by Category */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="transition-shadow lg:col-span-2">
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">
                      Revenue
                    </p>
                    <Delta pct={displayRevenueDelta} />
                  </div>
                  {/* Period filter buttons */}
                  <div className="inline-flex items-center rounded-lg border border-border/60 bg-muted/40 p-0.5 text-xs">
                    {(["today", "week", "month"] as PeriodTab[]).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setRevenuePeriod(tab)}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                          revenuePeriod === tab
                            ? "bg-background text-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {PERIOD_LABELS[tab]}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">
                  Ksh {money(displayRevenue)}
                  <span className="ml-2 text-xs font-medium text-muted-foreground">
                    ({PERIOD_LABELS[revenuePeriod]})
                  </span>
                </p>
              </CardHeader>
              <CardContent>
                {!revenueSummary || revenueSummary.orders_total === 0 ? (
                  <EmptyState
                    icon={Coins}
                    title="No revenue yet"
                    description="Revenue lands here as soon as orders start coming in."
                  />
                ) : (
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={activeRevenueSeries}
                        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                      >
                        <defs>
                          <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#e00613" stopOpacity={0.38} />
                            <stop offset="100%" stopColor="#e00613" stopOpacity={0.01} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(d: string) => (d.includes(":") ? d : formatDay(d))}
                          minTickGap={32}
                          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          tickFormatter={formatCompact}
                          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                          tickLine={false}
                          axisLine={false}
                          width={44}
                        />
                        <Tooltip cursor={{ stroke: "var(--border)" }} content={<RevenueTooltip />} />
                        <Area
                          type="monotone"
                          dataKey="revenue"
                          stroke="#e00613"
                          strokeWidth={2.5}
                          fill="url(#revenueFill)"
                          activeDot={{ r: 4, stroke: "#e00613", strokeWidth: 2, fill: "#fff" }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Stock by Category - units available per category */}
            <Card className="transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">
                    Stock by Category
                  </p>
                </div>
                <p className="text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">
                  {kpis.total_stock_units.toLocaleString()}
                  <span className="ml-1.5 text-sm font-medium text-muted-foreground">units</span>
                </p>
              </CardHeader>
              <CardContent>
                {stockUnitsByCategory === 0 ? (
                  <EmptyState
                    icon={Boxes}
                    title="No stock yet"
                    description="Inventory per category appears once products are stocked."
                  />
                ) : (
                  <div className="flex h-56 w-full items-center gap-4">
                    <div className="h-40 w-40 shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={stockByCategory}
                            dataKey="units"
                            nameKey="name"
                            innerRadius="62%"
                            outerRadius="100%"
                            paddingAngle={2}
                            stroke="none"
                          >
                            {stockByCategory.map((cat, index) => (
                              <Cell
                                key={cat.name}
                                fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip content={<ChartTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <ul className="flex max-h-56 min-w-0 flex-1 flex-col gap-1.5 overflow-y-auto">
                      {stockByCategory.map((cat, index) => (
                        <li key={cat.name} className="flex items-center gap-2 text-xs">
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{
                              backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
                            }}
                          />
                          <span className="min-w-0 flex-1 truncate text-muted-foreground">
                            {cat.name}
                          </span>
                          <span className="shrink-0 font-medium tabular-nums">
                            {cat.units.toLocaleString()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top Products (Sales vs Wishlist) + Orders (50/50 row) */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">
                    Top Products
                  </p>
                  {/* Switch between Sales and Wishlist */}
                  <div className="inline-flex items-center rounded-lg border border-border/60 bg-muted/40 p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setProductTab("sales")}
                      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                        productTab === "sales"
                          ? "bg-background text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <ShoppingBag className="size-3" />
                      By Sales
                    </button>
                    <button
                      type="button"
                      onClick={() => setProductTab("wishlisted")}
                      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                        productTab === "wishlisted"
                          ? "bg-background text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Heart className="size-3" />
                      By Wishlist
                    </button>
                  </div>
                </div>
                <p className="text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">
                  {productTab === "sales" ? (
                    <>
                      {(salesSummary?.units_sold ?? 0).toLocaleString()}
                      <span className="ml-1.5 text-sm font-medium text-muted-foreground">
                        units sold
                      </span>
                    </>
                  ) : (
                    <>
                      {(salesSummary?.wishlist_saves ?? 0).toLocaleString()}
                      <span className="ml-1.5 text-sm font-medium text-muted-foreground">
                        total saves
                      </span>
                    </>
                  )}
                </p>
              </CardHeader>
              <CardContent>
                {productTab === "sales" ? (
                  topProducts.length === 0 ? (
                    <EmptyState
                      icon={ShoppingBag}
                      title="No sales yet"
                      description="Best sellers appear here after your first orders."
                    />
                  ) : (
                    <ul className="flex flex-col">
                      {topProducts.map((prod, index) => (
                        <li
                          key={prod.id}
                          className={`flex items-center gap-3 ${index === topProducts.length - 1 ? "" : "border-b border-border/60 pb-3 mb-3"}`}
                        >
                          <span
                            className={`flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold tabular-nums ${
                              index === 0 ? "bg-gold text-black" : "bg-muted text-muted-foreground"
                            }`}
                          >
                            #{index + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <Link
                              href={`/admin/products/${prod.id}`}
                              className="block truncate text-sm font-medium text-foreground hover:text-primary transition-colors"
                            >
                              {prod.title}
                            </Link>
                            <p className="truncate text-xs text-muted-foreground">
                              {prod.units_sold.toLocaleString()} unit{prod.units_sold === 1 ? "" : "s"} sold
                            </p>
                          </div>
                          <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                            Ksh {money(prod.revenue)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )
                ) : (
                  topWishlisted.length === 0 ? (
                    <EmptyState
                      icon={Heart}
                      title="No wishlist saves yet"
                      description="Products saved to shoppers' wishlists will rank here."
                    />
                  ) : (
                    <ul className="flex flex-col">
                      {topWishlisted.map((prod, index) => (
                        <li
                          key={prod.id}
                          className={`flex items-center gap-3 ${index === topWishlisted.length - 1 ? "" : "border-b border-border/60 pb-3 mb-3"}`}
                        >
                          <span
                            className={`flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold tabular-nums ${
                              index === 0 ? "bg-gold text-black" : "bg-muted text-muted-foreground"
                            }`}
                          >
                            #{index + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <Link
                              href={`/admin/products/${prod.id}`}
                              className="block truncate text-sm font-medium text-foreground hover:text-primary transition-colors"
                            >
                              {prod.title}
                            </Link>
                            <p className="truncate text-xs text-muted-foreground">
                              Ksh {money(prod.price)} · {prod.stock > 0 ? `${prod.stock} in stock` : "Out of stock"}
                            </p>
                          </div>
                          <span className="shrink-0 flex items-center gap-1 text-sm font-semibold tabular-nums text-primary">
                            <Heart className="size-3.5 fill-primary text-primary" />
                            {prod.saves.toLocaleString()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )
                )}
              </CardContent>
            </Card>

            {/* Orders Summary & Trend */}
            <Card className="transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">
                      Orders
                    </p>
                    <Delta pct={displayOrdersDelta} />
                  </div>
                  {/* Period filter buttons */}
                  <div className="inline-flex items-center rounded-lg border border-border/60 bg-muted/40 p-0.5 text-xs">
                    {(["today", "week", "month"] as PeriodTab[]).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setOrdersPeriod(tab)}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                          ordersPeriod === tab
                            ? "bg-background text-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {PERIOD_LABELS[tab]}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">
                  {displayOrders.toLocaleString()}
                  <span className="ml-2 text-xs font-medium text-muted-foreground">
                    ({PERIOD_LABELS[ordersPeriod]})
                  </span>
                </p>
              </CardHeader>
              <CardContent>
                {!revenueSummary || revenueSummary.orders_total === 0 ? (
                  <EmptyState
                    icon={ClipboardList}
                    title="No orders yet"
                    description="Weekly order volumes appear once checkout goes live."
                  />
                ) : (
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={ordersSeries}
                        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                      >
                        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                        <XAxis
                          dataKey="week_start"
                          tickFormatter={formatDay}
                          minTickGap={32}
                          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                          tickLine={false}
                          axisLine={false}
                          width={32}
                        />
                        <Tooltip
                          cursor={{ fill: "var(--muted)", opacity: 0.6 }}
                          content={<OrdersTooltip />}
                        />
                        <Bar
                          dataKey="orders"
                          name="orders"
                          fill="var(--gold)"
                          radius={[5, 5, 0, 0]}
                          maxBarSize={40}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity - vertical connected timeline */}
          <Card className="transition-shadow">
            <CardHeader className="pb-3 border-b">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">
                  Recent Activity
                </p>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {activity.length} recent events
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {activity.length === 0 ? (
                <EmptyState
                  icon={Activity}
                  title="No recent activity"
                  description="Catalog, order, and customer events will show up here."
                />
              ) : (
                <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:bottom-3 before:left-[11px] before:top-3 before:w-0.5 before:bg-border/70 sm:before:left-[15px]">
                  {activity.map((item, index) => (
                    <TimelineItem
                      key={`${item.type}-${item.title}-${index}`}
                      item={item}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function TimelineItem({ item }: { item: RecentActivity }) {
  const isOrder = item.type === "order";
  const isProduct = item.type === "product";

  return (
    <div className="relative flex items-start gap-3">
      {/* Timeline node icon */}
      <div
        className={`absolute -left-6 sm:-left-8 top-0.5 flex size-6 sm:size-7 items-center justify-center rounded-full border-2 border-background text-xs shadow-xs ${
          isOrder
            ? "bg-gold text-black"
            : isProduct
              ? "bg-blue-600 text-white"
              : "bg-emerald-600 text-white"
        }`}
      >
        {isOrder ? (
          <ClipboardList className="size-3" />
        ) : isProduct ? (
          <Package className="size-3" />
        ) : (
          <UserPlus className="size-3" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
          <p className="text-sm font-semibold text-foreground truncate">
            {item.title}
          </p>
          <time className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
            {timeAgo(item.at)}
          </time>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {item.detail}
        </p>
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="flex h-56 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/30 px-8 text-center">
      <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-gold/15 text-gold">
        <Icon className="size-5" />
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="max-w-xs text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

/** Period-over-period change badge with trend icon and percentage only. */
function Delta({ pct }: { pct: number | null }) {
  if (pct === null || !Number.isFinite(pct)) return null;
  const up = pct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
        up
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "bg-red-500/10 text-red-600 dark:text-red-400"
      }`}
    >
      {up ? (
        <TrendingUp className="size-3 shrink-0" />
      ) : (
        <TrendingDown className="size-3 shrink-0" />
      )}
      <span>
        {up ? "+" : ""}
        {pct.toFixed(1)}%
      </span>
    </span>
  );
}
