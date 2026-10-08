"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ClipboardList,
  ExternalLink,
  LayoutDashboard,
  ShoppingBag,
  Users,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { api } from "@/lib/api";
import { useQuery } from "@/lib/use-query";
import type { NavCounts } from "@/lib/types";

interface NavItem {
  title: string;
  icon: React.ElementType;
  href?: string;
  exact?: boolean;
  /** Placeholder entries that do not navigate anywhere yet. */
  comingSoon?: boolean;
  /** Sidebar badge count (see NavCounts). */
  countKey?: keyof NavCounts;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "Dashboards",
    items: [
      { title: "Overview", icon: LayoutDashboard, href: "/admin", exact: true },
      { title: "Analytics", icon: BarChart3, comingSoon: true },
    ],
  },
  {
    label: "Management",
    items: [
      { title: "Orders", icon: ClipboardList, comingSoon: true, countKey: "orders" },
      { title: "Products", icon: ShoppingBag, href: "/admin/products", countKey: "products" },
      { title: "Customers", icon: Users, href: "/admin/customers", countKey: "customers" },
    ],
  },
];

// Full-bleed box: -mx-2 + an explicit calc() width so items reach both
// sidebar edges (buttons shrink-wrap otherwise). Only background-color
// transitions on hover/active, so the geometry never shifts.
const itemClassName = "-mx-2 h-9 w-[calc(100%_+_1rem)] gap-3 rounded-none px-5";

export function AppSidebar() {
  const pathname = usePathname();
  const { data: navCounts } = useQuery<NavCounts>(() =>
    api.get<NavCounts>("/api/v1/admin/nav-counts/"),
  );

  const renderCount = (item: NavItem) =>
    item.countKey && navCounts ? (
      <span className="ml-auto shrink-0 text-xs font-medium tabular-nums opacity-60">
        {navCounts[item.countKey].toLocaleString()}
      </span>
    ) : null;

  return (
    <Sidebar collapsible="none" className="border-r border-sidebar-border bg-sidebar">
      {/* Brand Header - height = logo's natural aspect at sidebar width (1600/362), matching the page header exactly */}
      <SidebarHeader className="h-[calc(var(--sidebar-width)*362/1600)] border-b border-sidebar-border p-0">
        <Link
          href="/admin"
          className="block h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sidebar-ring"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/waynz_logo.jpg"
            alt="Wayaz Collection"
            className="block h-full w-full object-cover"
          />
        </Link>
      </SidebarHeader>

      {/* Navigation with sections */}
      <SidebarContent className="py-2">
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="h-7 px-3 uppercase tracking-wider text-sidebar-foreground/60">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive = Boolean(item.href) && !item.comingSoon
                    ? item.exact
                      ? pathname === item.href
                      : pathname === item.href || pathname.startsWith(`${item.href}/`)
                    : false;

                  return (
                    <SidebarMenuItem key={item.title}>
                      {item.comingSoon ? (
                        <SidebarMenuButton
                          type="button"
                          tooltip={item.title}
                          className={itemClassName}
                        >
                          <item.icon className="size-4 shrink-0" />
                          <span className="min-w-0 flex-1 truncate">{item.title}</span>
                          {renderCount(item)}
                        </SidebarMenuButton>
                      ) : (
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={item.title}
                          className={itemClassName}
                        >
                          <Link href={item.href!}>
                            <item.icon className="size-4 shrink-0" />
                            <span className="min-w-0 flex-1 truncate">{item.title}</span>
                            {renderCount(item)}
                          </Link>
                        </SidebarMenuButton>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* Footer: quick link to the storefront */}
      <SidebarFooter className="border-t border-sidebar-border p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="View Storefront"
              className={itemClassName}
            >
              <Link href="/" target="_blank">
                <ExternalLink className="size-4 shrink-0" />
                <span>View Store</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
