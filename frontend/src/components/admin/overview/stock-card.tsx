"use client";

import { Boxes } from "lucide-react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { StockByCategory } from "@/lib/types";
import { ChartTooltip } from "@/components/admin/overview/tooltips";
import { ChartEmptyState } from "@/components/admin/overview/parts";

// On-brand ramp from the theme tokens (globals.css), applied in data order
// (largest stock first).
const CATEGORY_COLORS = [
  "var(--chart-1)",
  "var(--gold)",
  "var(--chart-2)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function StockByCategoryCard({
  totalStockUnits,
  stockByCategory,
}: {
  totalStockUnits: number;
  stockByCategory: StockByCategory[];
}) {
  const totalUnits = stockByCategory.reduce((sum, cat) => sum + cat.units, 0);

  return (
    <Card className="transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">
            Stock by Category
          </p>
        </div>
        <p className="text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">
          <AnimatedNumber value={totalStockUnits} />
          <span className="ml-1.5 text-sm font-medium text-muted-foreground">
            units
          </span>
        </p>
      </CardHeader>
      <CardContent>
        {totalUnits === 0 ? (
          <ChartEmptyState
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
                      backgroundColor:
                        CATEGORY_COLORS[index % CATEGORY_COLORS.length],
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
  );
}
