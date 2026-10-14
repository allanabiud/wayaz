"use client";

import Link from "next/link";
import { Heart, ShoppingBag } from "lucide-react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatKsh } from "@/lib/store-api";
import type { TopProduct, TopWishlistedProduct } from "@/lib/types";
import { ChartEmptyState } from "@/components/admin/overview/parts";

type ProductTab = "sales" | "wishlisted";

function RankBadge({ index }: { index: number }) {
  return (
    <span
      className={`flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold tabular-nums ${
        index === 0 ? "bg-gold text-black" : "bg-muted text-muted-foreground"
      }`}
    >
      #{index + 1}
    </span>
  );
}

export function TopProductsCard({
  tab,
  onTabChange,
  unitsSold,
  wishlistSaves,
  topProducts,
  topWishlisted,
}: {
  tab: ProductTab;
  onTabChange: (value: ProductTab) => void;
  unitsSold: number;
  wishlistSaves: number;
  topProducts: TopProduct[];
  topWishlisted: TopWishlistedProduct[];
}) {
  const tabClass = (active: boolean) =>
    `flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
      active
        ? "bg-card dark:bg-background text-foreground shadow-xs"
        : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <Card className="transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">
            Top Products
          </p>
          <div className="inline-flex items-center rounded-lg border border-border/60 bg-muted/40 p-0.5 text-xs">
            <button type="button" onClick={() => onTabChange("sales")} className={tabClass(tab === "sales")}>
              <ShoppingBag className="size-3" />
              By Sales
            </button>
            <button type="button" onClick={() => onTabChange("wishlisted")} className={tabClass(tab === "wishlisted")}>
              <Heart className="size-3" />
              By Wishlist
            </button>
          </div>
        </div>
        <p className="text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">
          {tab === "sales" ? (
            <>
              <AnimatedNumber value={unitsSold} />
              <span className="ml-1.5 text-sm font-medium text-muted-foreground">
                units sold
              </span>
            </>
          ) : (
            <>
              <AnimatedNumber value={wishlistSaves} />
              <span className="ml-1.5 text-sm font-medium text-muted-foreground">
                total saves
              </span>
            </>
          )}
        </p>
      </CardHeader>
      <CardContent>
        {tab === "sales" ? (
          topProducts.length === 0 ? (
            <ChartEmptyState
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
                  <RankBadge index={index} />
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
                    Ksh {formatKsh(prod.revenue)}
                  </span>
                </li>
              ))}
            </ul>
          )
        ) : (
          topWishlisted.length === 0 ? (
            <ChartEmptyState
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
                  <RankBadge index={index} />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/admin/products/${prod.id}`}
                      className="block truncate text-sm font-medium text-foreground hover:text-primary transition-colors"
                    >
                      {prod.title}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      Ksh {formatKsh(prod.price)} · {prod.stock > 0 ? `${prod.stock} in stock` : "Out of stock"}
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
  );
}
