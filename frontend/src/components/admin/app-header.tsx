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
    <header className="sticky top-0 z-30 grid w-full grid-cols-[1fr_auto] items-center gap-x-2 gap-y-2 border-b border-border/60 bg-background/80 px-3 py-2 backdrop-blur-md supports-[backdrop-filter]:bg-background/60 sm:px-4 md:flex md:h-[calc(var(--sidebar-width)*362/1600)] md:items-center md:gap-3 md:py-0">
      <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-1.5 sm:gap-2 md:col-auto md:row-auto md:contents">
        <SidebarTrigger className="-ml-1 shrink-0 text-muted-foreground hover:text-foreground md:hidden" />
        <div className="min-w-0 truncate">
          <Breadcrumbs />
        </div>
      </div>

      <div className="hidden flex-1 md:block" />

      {/* Search wraps to its own full-width row below md. */}
      <div className="col-span-2 row-start-2 w-full min-w-0 md:col-auto md:row-auto md:w-auto">
        <ProductSearch />
      </div>

      <div className="col-start-2 row-start-1 flex shrink-0 items-center gap-1 sm:gap-1.5 md:col-auto md:row-auto md:gap-2">
        <OrdersSheet />
        <NotificationsMenu />
        <ThemeToggle />
        <AccountMenu />
      </div>
    </header>
  );
}
