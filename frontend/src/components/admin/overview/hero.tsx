"use client";

import Link from "next/link";
import { CalendarDays, PackageCheck, ShoppingBag, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedNumber } from "@/components/ui/animated-number";
import type { Overview } from "@/lib/types";

const HERO_GRADIENT =
  "linear-gradient(135deg, #e00613 0%, #b6050f 50%, #8a040b 100%)";

const TODAY_LABEL = new Date().toLocaleDateString("en-KE", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

export function OverviewHero({
  user,
  data,
}: {
  user: { display_name?: string; username?: string } | null;
  data: Overview | null;
}) {
  const kpis = data?.kpis;
  const alerts = data?.low_stock_alerts ?? [];

  return (
    <section
      className="relative overflow-hidden rounded-2xl"
      style={{ background: HERO_GRADIENT }}
    >
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

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between pt-0.5">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              Welcome back, {user?.display_name || user?.username || "Admin"}
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-white/75 max-w-xl leading-relaxed">
              {kpis
                ? "Here is your current store status across products, inventory, and registered customers."
                : "Overview of your catalog performance and orders."}
            </p>
          </div>

          {kpis && (
            <div className="grid grid-cols-3 gap-2 sm:gap-3 shrink-0">
              {[
                {
                  icon: ShoppingBag,
                  label: "Active Products",
                  rawValue: kpis.total_products,
                },
                {
                  icon: PackageCheck,
                  label: "Units in Stock",
                  rawValue: kpis.total_stock_units,
                },
                {
                  icon: Users,
                  label: "Customers",
                  rawValue: kpis.total_customers,
                },
              ].map(({ icon: Icon, label, rawValue }) => (
                <div
                  key={label}
                  className="flex flex-col rounded-xl border border-white/15 bg-white/10 px-3.5 py-2.5 backdrop-blur-md min-w-[100px] sm:min-w-[125px]"
                >
                  <div className="flex items-center gap-1.5 text-white/75 text-[11px]">
                    <Icon className="size-3.5 shrink-0" />
                    <span className="truncate">{label}</span>
                  </div>
                  <span className="mt-1 text-base sm:text-lg font-bold tabular-nums text-white">
                    <AnimatedNumber value={rawValue} />
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
