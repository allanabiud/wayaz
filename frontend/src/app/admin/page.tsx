"use client";

import Link from "next/link";
import {
  Activity,
  Boxes,
  CalendarDays,
  ClipboardList,
  Coins,
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
import type { Overview, RecentActivity } from "@/lib/types";
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

export default function AdminOverviewPage() {
  const { user } = useAuth();

  const { data, error, loading, refetch } = useQuery<Overview>(() =>
    api.get<Overview>("/api/v1/admin/overview/"),
  );

  const kpis = data?.kpis;
  const alerts = data?.low_stock_alerts ?? [];
  const activity = data?.recent_activity ?? [];
  const topProducts = data?.top_products ?? [];
  const salesSummary = data?.sales_summary;
  const revenueSeries = data?.revenue_series ?? [];
  const revenueSummary = data?.revenue_summary;
  const ordersSeries = data?.orders_series ?? [];
  const stockByCategory = data?.stock_by_category ?? [];
  const stockUnitsByCategory = stockByCategory.reduce((sum, cat) => sum + cat.units, 0);

  const revenue30 = revenueSeries.reduce((sum, point) => sum + point.revenue, 0);

  // Total Revenue: last 30 days vs the 30 days before it.
  const revenuePrev30 = revenueSummary?.prev_30d ?? 0;
  const revenueDelta =
    revenuePrev30 > 0 ? ((revenue30 - revenuePrev30) / revenuePrev30) * 100 : null;

  // Weekly Orders: last 4 weeks vs the 4 weeks before them.
  const ordersPrev4 = ordersSeries.slice(0, 4).reduce((sum, point) => sum + point.orders, 0);
  const ordersLast4 = ordersSeries.slice(4).reduce((sum, point) => sum + point.orders, 0);
  const ordersDelta =
    ordersPrev4 > 0 ? ((ordersLast4 - ordersPrev4) / ordersPrev4) * 100 : null;

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

        <div className="relative z-10 flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between sm:px-7 sm:py-5">
          <div className="min-w-0">
            <span
              suppressHydrationWarning
              className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-white/90 backdrop-blur-sm"
            >
              <CalendarDays className="size-3" />
              {TODAY_LABEL}
            </span>

            <h1 className="mt-2 text-xl font-bold text-white sm:text-2xl">
              Welcome back, {user?.display_name || user?.username || "Admin"}
            </h1>
            <p className="mt-1 max-w-xl text-sm text-white/75">
              {kpis
                ? alerts.length > 0
                  ? `You have ${alerts.length} low-stock alert${alerts.length === 1 ? "" : "s"} and ${kpis.total_stock_units.toLocaleString()} units on hand today.`
                  : `All ${kpis.total_stock_units.toLocaleString()} units are healthy across the catalog today.`
                : "Here's your catalog overview for today."}
            </p>

            {kpis && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {[
                  { icon: Boxes, label: `${kpis.total_products.toLocaleString()} products` },
                  { icon: PackageCheck, label: `${kpis.total_stock_units.toLocaleString()} units` },
                  { icon: Users, label: `${kpis.total_customers.toLocaleString()} shoppers` },
                ].map(({ icon: Icon, label }) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] text-white backdrop-blur-sm"
                  >
                    <Icon className="size-3 text-white/70" />
                    <span className="font-semibold">{label}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="shrink-0">
            <Button asChild variant="secondary" size="sm">
              <Link href="/admin/products">Manage Products</Link>
            </Button>
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
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">
                    Total Revenue
                  </p>
                  <Delta pct={revenueDelta} label="vs prev 30 days" />
                </div>
                <p className="text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">
                  Ksh {money(revenue30)}
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
                        data={revenueSeries}
                        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                      >
                        <defs>
                          <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#e00613" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="#e00613" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} stroke="var(--border)" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={formatDay}
                          minTickGap={48}
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
                          strokeWidth={2}
                          fill="url(#revenueFill)"
                          activeDot={{ r: 4 }}
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

          {/* Top Products + Weekly Orders (50/50 row) */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">
                    Top Products
                  </p>
                </div>
                <p className="text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">
                  {(salesSummary?.units_sold ?? 0).toLocaleString()}
                  <span className="ml-1.5 text-sm font-medium text-muted-foreground">units sold</span>
                </p>
              </CardHeader>
              <CardContent>
                {topProducts.length === 0 ? (
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
                            className="block truncate text-sm font-medium text-foreground hover:text-primary"
                          >
                            {prod.title}
                          </Link>
                          <p className="truncate text-xs text-muted-foreground">
                            {prod.units_sold.toLocaleString()} unit{prod.units_sold === 1 ? "" : "s"} sold
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">
                          Ksh {money(prod.revenue)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Weekly Orders - vertical bar chart */}
            <Card className="transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">
                    Weekly Orders
                  </p>
                  <Delta pct={ordersDelta} label="vs prev 4 weeks" />
                </div>
                <p className="text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">
                  {ordersLast4.toLocaleString()}
                  <span className="ml-1.5 text-sm font-medium text-muted-foreground">last 4 weeks</span>
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
                        <CartesianGrid vertical={false} stroke="var(--border)" />
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
                          radius={[4, 4, 0, 0]}
                          maxBarSize={44}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity - own full-width row */}
          <Card className="transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">
                  Recent Activity
                </p>
              </div>
              <p className="text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">
                {activity.length.toLocaleString()}
                <span className="ml-1.5 text-sm font-medium text-muted-foreground">events</span>
              </p>
            </CardHeader>
            <CardContent>
              {activity.length === 0 ? (
                <EmptyState
                  icon={Activity}
                  title="No recent activity"
                  description="Catalog and account events will show up here."
                />
              ) : (
                <ul className="flex flex-col">
                  {activity.map((item, index) => (
                    <ActivityRow
                      key={`${item.type}-${item.title}-${index}`}
                      item={item}
                      isLast={index === activity.length - 1}
                    />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
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

/** Period-over-period change in the card's top-right corner (hidden without data). */
function Delta({ pct, label }: { pct: number | null; label: string }) {
  if (pct === null) return null;
  const up = pct >= 0;
  return (
    <p className="flex min-w-0 items-center gap-1 text-xs">
      {up ? (
        <TrendingUp className="size-3.5 shrink-0 text-emerald-500" />
      ) : (
        <TrendingDown className="size-3.5 shrink-0 text-red-500" />
      )}
      <span
        className={`font-semibold tabular-nums ${
          up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
        }`}
      >
        {up ? "+" : "-"}
        {Math.abs(pct).toFixed(1)}%
      </span>
      <span className="truncate text-muted-foreground">{label}</span>
    </p>
  );
}

function ActivityRow({ item, isLast }: { item: RecentActivity; isLast: boolean }) {
  const isProduct = item.type === "product";
  return (
    <li className={`flex items-start gap-3 ${isLast ? "" : "border-b border-border/60 pb-3 mb-3"}`}>
      <div
        className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${
          isProduct ? "bg-blue-500/10 text-blue-500" : "bg-gold/15 text-gold"
        }`}
      >
        {isProduct ? <Package className="size-4" /> : <UserPlus className="size-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
        <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
      </div>
      <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(item.at)}</span>
    </li>
  );
}
