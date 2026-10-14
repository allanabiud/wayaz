"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { useQuery } from "@/lib/use-query";
import type { ContactMessage, Paginated } from "@/lib/types";

/** How often the unread list refreshes while the dashboard is open. */
const POLL_MS = 60_000;
const PREVIEW_COUNT = 5;

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
  });
}

/** Header bell for the contact inbox: unread count (matching the sidebar
 *  Messages badge) and deep links into the inbox, which marks read on open. */
export function NotificationsMenu() {
  const pathname = usePathname();
  const { data, refetch } = useQuery<Paginated<ContactMessage>>(
    () =>
      api.get<Paginated<ContactMessage>>(
        `/api/v1/admin/contact-messages/?status=unread&page_size=${PREVIEW_COUNT}`,
      ),
    // Re-check on navigation (e.g. returning from the inbox after reading).
    [pathname],
  );

  useEffect(() => {
    const timer = setInterval(refetch, POLL_MS);
    return () => clearInterval(timer);
  }, [refetch]);

  const unread = data?.count ?? 0;
  const messages = data?.results ?? [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="lg"
          className="relative gap-2 cursor-pointer"
          aria-label={
            unread > 0 ? `Notifications: ${unread} unread messages` : "Notifications"
          }
        >
          <Bell className="size-4" />
          <span className="hidden sm:inline">Alerts</span>
          {unread > 0 && (
            <Badge className="absolute -right-1.5 -top-1.5 size-5 justify-center rounded-full p-0 tabular-nums">
              {unread > 9 ? "9+" : unread}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="font-normal">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">Contact messages</span>
            <span className="text-xs text-muted-foreground">
              {unread} unread
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {messages.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No unread messages.
          </p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {messages.map((msg) => (
              <DropdownMenuItem key={msg.id} asChild className="cursor-pointer">
                <Link
                  href={`/admin/messages?message=${msg.id}`}
                  className="flex items-start gap-2 py-2"
                >
                  <Mail className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {msg.subject || "(no subject)"}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {msg.name} · {msg.email}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground/70">
                      {msg.message}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground/60">
                      {timeAgo(msg.created_at)}
                    </span>
                  </span>
                </Link>
              </DropdownMenuItem>
            ))}
          </div>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="cursor-pointer">
          <Link href="/admin/messages" className="flex w-full items-center justify-between">
            <span>View all messages</span>
            {unread > PREVIEW_COUNT && (
              <Badge variant="secondary" className="tabular-nums">
                +{unread - PREVIEW_COUNT}
              </Badge>
            )}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
