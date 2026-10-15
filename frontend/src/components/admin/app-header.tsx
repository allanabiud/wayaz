"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { ProductSearch } from "@/components/admin/product-search";
import { OrdersSheet } from "@/components/admin/orders-sheet";
import { AccountMenu } from "@/components/admin/account-menu";
import { NotificationsMenu } from "@/components/admin/notifications";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 bg-background/80 px-4 py-2 backdrop-blur-md supports-[backdrop-filter]:bg-background/60 md:h-[calc(var(--sidebar-width)*362/1600)] md:flex-nowrap md:gap-3 md:py-0">
      <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground md:hidden" />

      <Breadcrumbs />

      <div className="flex-1" />

      {/* Search wraps to its own full-width row below md. */}
      <ProductSearch />

      <div className="flex items-center gap-2">
        <OrdersSheet />
        <NotificationsMenu />
        <ThemeToggle />
        <AccountMenu />
      </div>
    </header>
  );
}
