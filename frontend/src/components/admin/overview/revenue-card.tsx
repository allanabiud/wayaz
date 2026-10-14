"use client";

import { Coins } from "lucide-react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatKsh } from "@/lib/store-api";
import type { RevenuePoint, RevenueSummary, TimeMetric } from "@/lib/types";
import { formatCompact, formatDay } from "@/components/admin/overview/format";
import { Delta, RevenueTooltip } from "@/components/admin/overview/tooltips";
import {
  ChartEmptyState,
  SegmentedControl,
} from "@/components/admin/overview/parts";

export type PeriodTab = "today" | "week" | "month";

export const PERIOD_LABELS: Record<PeriodTab, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
};

export function PeriodTabs({
  value,
  onChange,
}: {
  value: PeriodTab;
  onChange: (value: PeriodTab) => void;
}) {
  return (
    <SegmentedControl
      value={value}
      onChange={onChange}
      options={(["today", "week", "month"] as PeriodTab[]).map((tab) => ({
        value: tab,
        label: PERIOD_LABELS[tab],
      }))}
    />
  );
}

export function RevenueCard({
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
  series: RevenuePoint[];
}) {
  const displayRevenue = metric ? metric.current : (summary?.total ?? 0);

  return (
    <Card className="transition-shadow lg:col-span-2">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">
              Revenue
            </p>
            <Delta pct={metric ? metric.percent : null} />
          </div>
          <PeriodTabs value={period} onChange={onPeriodChange} />
        </div>
        <p className="text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">
          Ksh <AnimatedNumber value={displayRevenue} format={formatKsh} />
          <span className="ml-2 text-xs font-medium text-muted-foreground">
            ({PERIOD_LABELS[period]})
          </span>
        </p>
      </CardHeader>
      <CardContent>
        {!summary || summary.orders_total === 0 ? (
          <ChartEmptyState
            icon={Coins}
            title="No revenue yet"
            description="Revenue lands here as soon as orders start coming in."
          />
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={series}
                margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              >
                <defs>
                  <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#e00613" stopOpacity={0.38} />
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
                  tickFormatter={(d: string) =>
                    d.includes(":") ? d : formatDay(d)
                  }
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
                <Tooltip
                  cursor={{ stroke: "var(--border)" }}
                  content={<RevenueTooltip />}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#e00613"
                  strokeWidth={2.5}
                  fill="url(#revenueFill)"
                  activeDot={{
                    r: 4,
                    stroke: "#e00613",
                    strokeWidth: 2,
                    fill: "#fff",
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
