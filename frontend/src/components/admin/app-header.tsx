"use client";

import { useState } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { ProductSearch } from "@/components/admin/product-search";
import { OrdersSheet } from "@/components/admin/orders-sheet";
import { AccountMenu } from "@/components/admin/account-menu";
import { NotificationsMenu } from "@/components/admin/notifications";

export function AppHeader() {
  const [searchFocused, setSearchFocused] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-[calc(var(--sidebar-width)*362/1600)] shrink-0 items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      <SidebarTrigger
        className={`-ml-1 text-muted-foreground hover:text-foreground ${searchFocused ? "hidden" : "md:hidden"}`}
      />

      <Breadcrumbs />

      <div className="flex-1" />

      <ProductSearch onFocusChange={setSearchFocused} />

      <div className="flex items-center gap-2">
        <OrdersSheet />
        <NotificationsMenu />
        <ThemeToggle />
        <AccountMenu />
      </div>
    </header>
  );
}
