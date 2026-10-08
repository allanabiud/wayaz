"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/admin/app-sidebar";
import { AppHeader } from "@/components/admin/app-header";
import { useAuth } from "@/lib/auth-context";

function GateSkeleton() {
  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden w-64 border-r bg-sidebar p-4 md:block">
        <Skeleton className="h-8 w-32 mb-6" />
        <div className="mb-4 h-3 w-16 rounded-md bg-sidebar-foreground/20" />
        <div className="space-y-3">
          {Array.from({ length: 1 }).map((_, i) => (
            <Skeleton key={`a-${i}`} className="h-9 w-full rounded-xl" />
          ))}
        </div>
        <div className="mt-6 mb-4 h-3 w-20 rounded-md bg-sidebar-foreground/20" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={`b-${i}`} className="h-9 w-full rounded-xl" />
          ))}
        </div>
      </div>
      <div className="flex-1 flex flex-col">
        {/* Matches the logo-derived header height (16rem × 362/1600 = 3.62rem) */}
        <div className="h-[3.62rem] border-b flex items-center px-4 justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="size-8 rounded-full" />
        </div>
        <div className="p-6 max-w-6xl w-full mx-auto space-y-6">
          <Skeleton className="h-10 w-48" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { ready, isAuthenticated, canManage, user, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [ready, isAuthenticated, pathname, router]);

  if (!ready || !isAuthenticated) return <GateSkeleton />;

  if (!canManage) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-6">
        <div className="max-w-md rounded-2xl border bg-card p-6 text-center shadow-lg">
          <ShieldAlert className="mx-auto mb-4 size-10 text-destructive" aria-hidden />
          <h1 className="text-lg font-bold">Staff Access Required</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This account (<span className="font-medium text-foreground">{user?.username}</span>) is
            signed in with role <span className="font-semibold text-primary capitalize">{user?.role}</span>. The
            admin backoffice is limited to staff and admin users.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Button asChild className="w-full">
              <Link href="/">Return to Storefront</Link>
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                signOut();
                router.replace(`/login?next=${encodeURIComponent(pathname)}`);
              }}
            >
              Sign in with staff account
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <main className="flex-1 px-4 py-6 md:px-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
