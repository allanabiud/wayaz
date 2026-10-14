"use client";

import { ClipboardList } from "lucide-react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { OrderPoint, RevenueSummary, TimeMetric } from "@/lib/types";
import { formatDay } from "@/components/admin/overview/format";
import { Delta, OrdersTooltip } from "@/components/admin/overview/tooltips";
import { ChartEmptyState } from "@/components/admin/overview/parts";
import {
  PeriodTabs,
  PERIOD_LABELS,
  type PeriodTab,
} from "@/components/admin/overview/revenue-card";

export function OrdersCard({
  period,
  onPeriodChange,
  metric,
  summary,
  series,
}: {
  period: PeriodTab;
  onPeriodChange: (value: PeriodTab) => void;
  metric?: TimeMetric;
  summary?: RevenueSummary;
  series: Array<Pick<OrderPoint, "date" | "orders">>;
}) {
  const displayOrders = metric ? metric.current : (summary?.orders_total ?? 0);

  return (
    <Card className="transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">
              Orders
            </p>
            <Delta pct={metric ? metric.percent : null} />
          </div>
          <PeriodTabs value={period} onChange={onPeriodChange} />
        </div>
        <p className="text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">
          <AnimatedNumber value={displayOrders} />
          <span className="ml-2 text-xs font-medium text-muted-foreground">
            ({PERIOD_LABELS[period]})
          </span>
        </p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {!summary || summary.orders_total === 0 ? (
          <ChartEmptyState
            icon={ClipboardList}
            title="No orders yet"
            description="Order volume appears here once checkout goes live."
          />
        ) : (
          // flex-1 so the bars fill the card even when the taller
          // Top Products list beside them stretches this row.
          <div className="min-h-56 w-full flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={series}
                margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              >
                <CartesianGrid
                  vertical={false}
                  stroke="var(--border)"
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) =>
                    d.includes(":") ? d : formatDay(d)
                  }
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
  );
}
