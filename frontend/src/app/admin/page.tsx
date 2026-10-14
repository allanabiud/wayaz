"use client";

import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@/lib/use-query";
import type { Overview } from "@/lib/types";
import { OverviewHero } from "@/components/admin/overview/hero";
import {
  RevenueCard,
  type PeriodTab,
} from "@/components/admin/overview/revenue-card";
import { StockByCategoryCard } from "@/components/admin/overview/stock-card";
import { TopProductsCard } from "@/components/admin/overview/top-products-card";
import { OrdersCard } from "@/components/admin/overview/orders-card";
import { RecentActivityCard } from "@/components/admin/overview/activity-card";

export default function AdminOverviewPage() {
  const { user } = useAuth();
  const [revenuePeriod, setRevenuePeriod] = useState<PeriodTab>("month");
  const [ordersPeriod, setOrdersPeriod] = useState<PeriodTab>("week");
  const [productTab, setProductTab] = useState<"sales" | "wishlisted">("sales");

  const { data, error, loading, refetch } = useQuery<Overview>(() =>
    api.get<Overview>("/api/v1/admin/overview/"),
  );

  const kpis = data?.kpis;
  const timeMetrics = data?.time_metrics;
  const activity = data?.recent_activity ?? [];
  const topProducts = data?.top_products ?? [];
  const topWishlisted = data?.top_wishlisted ?? [];
  const salesSummary = data?.sales_summary;
  const revenueSummary = data?.revenue_summary;
  // Order bars follow the period filter: hourly for Today, daily otherwise.
  const activeOrdersSeries =
    ordersPeriod === "today"
      ? (data?.orders_series_today ?? [])
      : ordersPeriod === "week"
        ? (data?.orders_series_week ?? [])
        : (data?.orders_series_month ?? []);
  const stockByCategory = data?.stock_by_category ?? [];

  const activeRevenueSeries =
    revenuePeriod === "today"
      ? (data?.revenue_series_today ?? [])
      : revenuePeriod === "week"
        ? (data?.revenue_series_week ?? [])
        : (data?.revenue_series_month ?? data?.revenue_series ?? []);

  return (
    <div className="space-y-6">
      <OverviewHero user={user} data={data} />

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
          <div className="grid gap-4 lg:grid-cols-3">
            <RevenueCard
              period={revenuePeriod}
              onPeriodChange={setRevenuePeriod}
              metric={timeMetrics?.revenue[revenuePeriod]}
              summary={revenueSummary}
              series={activeRevenueSeries}
            />
            <StockByCategoryCard
              totalStockUnits={kpis.total_stock_units}
              stockByCategory={stockByCategory}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <TopProductsCard
              tab={productTab}
              onTabChange={setProductTab}
              unitsSold={salesSummary?.units_sold ?? 0}
              wishlistSaves={salesSummary?.wishlist_saves ?? 0}
              topProducts={topProducts}
              topWishlisted={topWishlisted}
            />
            <OrdersCard
              period={ordersPeriod}
              onPeriodChange={setOrdersPeriod}
              metric={timeMetrics?.orders[ordersPeriod]}
              summary={revenueSummary}
              series={activeOrdersSeries}
            />
          </div>

          <RecentActivityCard activity={activity} />
        </>
      )}
    </div>
  );
}
