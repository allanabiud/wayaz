import { TrendingDown, TrendingUp } from "lucide-react";
import { formatKsh } from "@/lib/store-api";
import { formatDay } from "@/components/admin/overview/format";

export function ChartTooltip({
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

export function RevenueTooltip({
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
        <span className="font-semibold text-foreground">Ksh {formatKsh(point.revenue ?? 0)}</span> revenue
      </p>
      <p className="text-muted-foreground">
        <span className="font-semibold text-foreground">{point.orders ?? 0}</span> order
        {(point.orders ?? 0) === 1 ? "" : "s"}
      </p>
    </div>
  );
}

export function OrdersTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: { date?: string; orders?: number } }>;
}) {
  if (!active || !payload?.length || !payload[0]?.payload) return null;
  const point = payload[0].payload;
  // Buckets are "14:00" for Today and a YYYY-MM-DD day otherwise.
  const bucket = point.date ?? "";
  const label = bucket.includes(":") ? bucket : bucket ? formatDay(bucket) : "";
  return (
    <div className="rounded-lg border border-border/60 bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      <p className="text-muted-foreground">
        <span className="font-semibold text-foreground">{point.orders ?? 0}</span> order
        {(point.orders ?? 0) === 1 ? "" : "s"}
      </p>
    </div>
  );
}

export function Delta({ pct }: { pct: number | null }) {
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
