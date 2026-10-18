"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ClipboardList,
  CreditCard,
  ExternalLink,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Settings,
  ShoppingBag,
  Tags,
  Ticket,
  UserCog,
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
  useSidebar,
} from "@/components/ui/sidebar";
import { api } from "@/lib/api";
import { useQuery } from "@/lib/use-query";
import type { NavCounts, StoreSettings } from "@/lib/types";

interface NavItem {
  title: string;
  icon: React.ElementType;
  href?: string;
  exact?: boolean;
  /** Placeholder entries that do not navigate anywhere yet. */
  comingSoon?: boolean;
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
      { title: "Analytics", icon: BarChart3, href: "/admin/analytics" },
    ],
  },
  {
    label: "Management",
    items: [
      {
        title: "Orders",
        icon: ClipboardList,
        href: "/admin/orders",
        countKey: "orders",
      },
      {
        title: "Products",
        icon: ShoppingBag,
        href: "/admin/products",
        countKey: "products",
      },
      {
        title: "Categories",
        icon: Tags,
        href: "/admin/categories",
        countKey: "categories",
      },
      {
        title: "Reviews",
        icon: MessageSquare,
        href: "/admin/reviews",
        countKey: "reviews",
      },
      {
        title: "Messages",
        icon: Mail,
        href: "/admin/messages",
        countKey: "messages",
      },
      {
        title: "Coupons",
        icon: Ticket,
        href: "/admin/coupons",
        countKey: "coupons",
      },
      {
        title: "Payments",
        icon: CreditCard,
        href: "/admin/payments",
        countKey: "payments",
      },
      { title: "Team", icon: UserCog, href: "/admin/team", countKey: "team" },
      {
        title: "Customers",
        icon: Users,
        href: "/admin/customers",
        countKey: "customers",
      },
    ],
  },
  {
    label: "Settings",
    items: [
      { title: "Store Settings", icon: Settings, href: "/admin/settings" },
    ],
  },
];

// -mx-2 plus an explicit calc() width so items reach both sidebar edges
// (buttons shrink-wrap otherwise); hover only changes background-color.
const itemClassName = "-mx-2 h-9 w-[calc(100%_+_1rem)] gap-3 rounded-none px-5";

export function AppSidebar() {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  useEffect(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [pathname, isMobile, setOpenMobile]);

  const handleNavClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const { data: navCounts } = useQuery<NavCounts>(
    () => api.get<NavCounts>("/api/v1/admin/nav-counts/"),
    // Re-check on navigation so the badge matches the header bell after
    // messages get read or deleted elsewhere.
    [pathname],
  );
  const { data: settings } = useQuery<StoreSettings>(() =>
    api.get<StoreSettings>("/api/v1/catalog/settings/"),
  );

  const renderCount = (item: NavItem) =>
    item.countKey && navCounts ? (
      <span className="ml-auto shrink-0 text-xs font-medium tabular-nums opacity-60">
        {navCounts[item.countKey].toLocaleString()}
      </span>
    ) : null;

  return (
    <Sidebar
      collapsible="none"
      className="border-r border-sidebar-border bg-sidebar"
    >
      {/* Height = logo's natural aspect at sidebar width, matching the
          page header. */}
      <SidebarHeader className="h-[calc(var(--sidebar-width)*362/1600)] border-b border-sidebar-border p-0">
        <Link
          href="/admin"
          onClick={handleNavClick}
          className="block h-full w-full outline-none"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={settings?.logo_url || "/wayaz_logo.jpeg"}
            alt={settings?.store_name || "Wayaz Collection"}
            className="block h-full w-full object-cover"
          />
        </Link>
      </SidebarHeader>

      <SidebarContent className="py-2">
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="h-7 px-3 uppercase tracking-wider text-sidebar-foreground/60">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive =
                    Boolean(item.href) && !item.comingSoon
                      ? item.exact
                        ? pathname === item.href
                        : pathname === item.href ||
                          pathname.startsWith(`${item.href}/`)
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
                          <span className="min-w-0 flex-1 truncate">
                            {item.title}
                          </span>
                          {renderCount(item)}
                        </SidebarMenuButton>
                      ) : (
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={item.title}
                          className={itemClassName}
                        >
                          <Link href={item.href!} onClick={handleNavClick}>
                            <item.icon className="size-4 shrink-0" />
                            <span className="min-w-0 flex-1 truncate">
                              {item.title}
                            </span>
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

      <SidebarFooter className="border-t border-sidebar-border p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="View Storefront"
              className={itemClassName}
            >
              <Link href="/" target="_blank" onClick={handleNavClick}>
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
