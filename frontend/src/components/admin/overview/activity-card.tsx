"use client";

import { Activity, ClipboardList, Package, UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { RecentActivity } from "@/lib/types";
import { timeAgo } from "@/components/admin/overview/format";
import { ChartEmptyState } from "@/components/admin/overview/parts";

function TimelineItem({ item }: { item: RecentActivity }) {
  const isOrder = item.type === "order";
  const isProduct = item.type === "product";

  return (
    <div className="relative flex items-start gap-3">
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
        <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
      </div>
    </div>
  );
}

export function RecentActivityCard({
  activity,
}: {
  activity: RecentActivity[];
}) {
  return (
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
          <ChartEmptyState
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
  );
}
