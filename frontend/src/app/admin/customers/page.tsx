"use client";

import { useState } from "react";
import { Heart, Loader2, Mail, MapPin, Phone } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ListPagination } from "@/components/ui/pagination";
import { TableSkeleton } from "@/components/admin/table-skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, ErrorState, PageHeader } from "@/components/ui/states";
import { FilterSearch, FilterToolbar } from "@/components/admin/filter-toolbar";
import { api } from "@/lib/api";
import { useQuery } from "@/lib/use-query";
import type { Customer, Paginated } from "@/lib/types";

const PAGE_SIZE = 10;

const CUSTOMER_COLUMNS = [
  { header: "Customer", width: "w-[26%]" },
  { header: "Contact", width: "w-[28%]" },
  { header: "Role", width: "w-[12%]" },
  { header: "Addresses", width: "w-[12%]", align: "right" as const },
  { header: "Wishlist", width: "w-[10%]", align: "right" as const },
  { header: "Joined", width: "w-[12%]", align: "right" as const },
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString("en-KE", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}

function getInitials(name?: string) {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, error, loading, refetch } = useQuery<Paginated<Customer>>(
    () =>
      api.get<Paginated<Customer>>(
        `/api/v1/admin/customers/?page=${page}&page_size=${PAGE_SIZE}`,
      ),
    [page],
  );

  const rows = (data?.results ?? []).filter((c) => {
    if (!search.trim()) return true;
    const needle = search.trim().toLowerCase();
    return [c.display_name, c.username, c.email, c.phone_number]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle));
  });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="People"
        title="Customers"
        description={
          data
            ? `${data.count.toLocaleString()} registered shoppers and staff accounts`
            : undefined
        }
      />

      <FilterToolbar
        search={
          <FilterSearch
            value={search}
            onValueChange={setSearch}
            placeholder="Search name, email, username…"
            loading={loading && Boolean(data)}
          />
        }
        trailing={
          <div className="flex items-center gap-2">
            {loading && data && (
              <Badge
                variant="outline"
                className="h-9 gap-1.5 px-3 text-xs text-muted-foreground animate-in fade-in duration-200"
              >
                <Loader2 className="size-3 animate-spin text-primary" />
                Updating…
              </Badge>
            )}
            <Badge variant="secondary" className="h-9 px-3 text-xs">
              {data?.count ?? 0} total
            </Badge>
          </div>
        }
      />

      {error && <ErrorState message={error} onRetry={refetch} />}

      {loading && !data && (
        <TableSkeleton columns={CUSTOMER_COLUMNS} rowCount={6} />
      )}

      {data && rows.length === 0 && (
        <EmptyState
          title={search ? "No customers match your search" : "No customers yet"}
          hint={
            search
              ? "Search covers the current loaded page."
              : "Registered shoppers will appear here once accounts are created."
          }
        />
      )}

      {data && rows.length > 0 && (
        <div
          className={`space-y-4 transition-opacity duration-200 ${
            loading ? "opacity-60 pointer-events-none" : "opacity-100"
          }`}
        >
          <div className="md:hidden space-y-3">
            {rows.map((c) => (
              <Card key={c.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                        {getInitials(c.display_name || c.username)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {c.display_name || c.username}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        @{c.username}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={
                      c.role === "admin"
                        ? "default"
                        : c.role === "staff"
                          ? "secondary"
                          : "outline"
                    }
                    className="capitalize text-[11px]"
                  >
                    {c.role}
                  </Badge>
                </div>

                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {c.email && (
                    <div className="flex items-center gap-1.5 truncate">
                      <Mail className="size-3.5 shrink-0" />
                      <span>{c.email}</span>
                    </div>
                  )}
                  {c.phone_number && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="size-3.5 shrink-0" />
                      <span>{c.phone_number}</span>
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <MapPin className="size-3.5" />
                      {c.addresses_count} addr
                    </span>
                    <span className="flex items-center gap-1">
                      <Heart className="size-3.5 text-primary" />
                      {c.wishlist_count} saved
                    </span>
                  </div>
                  <span>Joined {formatDate(c.date_joined)}</span>
                </div>
              </Card>
            ))}
          </div>

          <div className="hidden rounded-2xl bg-card shadow-(--shadow-card) overflow-hidden md:block">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="w-[26%] font-semibold text-xs">
                    Customer
                  </TableHead>
                  <TableHead className="w-[28%] font-semibold text-xs">
                    Contact
                  </TableHead>
                  <TableHead className="w-[12%] font-semibold text-xs">
                    Role
                  </TableHead>
                  <TableHead className="w-[12%] font-semibold text-xs text-right">
                    Addresses
                  </TableHead>
                  <TableHead className="w-[10%] font-semibold text-xs text-right">
                    Wishlist
                  </TableHead>
                  <TableHead className="w-[12%] font-semibold text-xs text-right">
                    Joined
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id} className="hover:bg-muted/50">
                    <TableCell className="truncate">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {c.display_name || c.username}
                        </p>
                        <p className="truncate text-xs text-muted-foreground font-mono">
                          @{c.username}
                        </p>
                      </div>
                    </TableCell>

                    <TableCell className="truncate text-xs">
                      <div className="text-foreground">{c.email || "-"}</div>
                      {c.phone_number && (
                        <div className="text-muted-foreground text-[11px]">
                          {c.phone_number}
                        </div>
                      )}
                    </TableCell>

                    <TableCell>
                      <Badge
                        variant={
                          c.role === "admin"
                            ? "default"
                            : c.role === "staff"
                              ? "secondary"
                              : "outline"
                        }
                        className="capitalize text-xs font-medium"
                      >
                        {c.role}
                      </Badge>
                      {!c.is_active && (
                        <Badge
                          variant="destructive"
                          className="ml-1 text-[10px]"
                        >
                          inactive
                        </Badge>
                      )}
                    </TableCell>

                    <TableCell className="text-right text-xs tabular-nums font-mono">
                      {c.addresses_count}
                    </TableCell>

                    <TableCell className="text-right text-xs tabular-nums font-mono">
                      {c.wishlist_count}
                    </TableCell>

                    <TableCell className="text-right text-xs text-muted-foreground">
                      {formatDate(c.date_joined)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ListPagination
            page={page}
            count={data?.count ?? 0}
            pageSize={PAGE_SIZE}
            itemCount={rows.length}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}
