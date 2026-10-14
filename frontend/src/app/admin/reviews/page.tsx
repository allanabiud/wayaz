"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Eye,
  EyeOff,
  ExternalLink,
  Loader2,
  Star,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ListPagination } from "@/components/ui/list-pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, PageHeader } from "@/components/admin/states";
import { FilterSearch, FilterToolbar } from "@/components/admin/filter-toolbar";
import { api, ApiError } from "@/lib/api";
import { useQuery } from "@/lib/use-query";
import type { AdminReview, Paginated } from "@/lib/types";

const ALL = "__all__";
const PAGE_SIZE = 10;

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

export default function AdminReviewsPage() {
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [status, setStatus] = useState(ALL);
  const [page, setPage] = useState(1);

  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<AdminReview | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (appliedSearch) params.set("search", appliedSearch);
    if (status !== ALL) params.set("status", status);
    params.set("page", String(page));
    params.set("page_size", String(PAGE_SIZE));
    return params.toString();
  }, [appliedSearch, status, page]);

  const { data, error, loading, refetch } = useQuery<Paginated<AdminReview>>(
    () => api.get<Paginated<AdminReview>>(`/api/v1/admin/reviews/?${query}`),
    [query],
  );

  const reviews = data?.results ?? [];
  const filtersActive = Boolean(appliedSearch) || status !== ALL;

  const resetFilters = () => {
    setSearch("");
    setAppliedSearch("");
    setStatus(ALL);
    setPage(1);
  };

  const toggleVisibility = async (review: AdminReview) => {
    if (togglingId !== null) return;
    setTogglingId(review.id);
    setActionError(null);
    try {
      await api.patch(`/api/v1/admin/reviews/${review.id}/`, {
        is_approved: !review.is_approved,
      });
      refetch();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Could not update this review.",
      );
    } finally {
      setTogglingId(null);
    }
  };

  const remove = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(`/api/v1/admin/reviews/${pendingDelete.id}/`);
      setPendingDelete(null);
      refetch();
    } catch (err) {
      setDeleteError(
        err instanceof ApiError ? err.message : "Could not delete this review.",
      );
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Catalog"
        title="Reviews"
        description={
          data
            ? `${data.count.toLocaleString()} ${data.count === 1 ? "review" : "reviews"} from shoppers`
            : "Moderate shopper reviews"
        }
      />

      <FilterToolbar
        search={
          <FilterSearch
            value={search}
            onValueChange={setSearch}
            onSubmit={() => {
              setAppliedSearch(search.trim());
              setPage(1);
            }}
            onClear={() => {
              setSearch("");
              setAppliedSearch("");
              setPage(1);
            }}
            placeholder="Search comments, products or reviewers…"
          />
        }
        filters={
          <>
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[140px] h-9 text-xs">
                <SelectValue placeholder="Visibility" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All reviews</SelectItem>
                <SelectItem value="approved">Visible</SelectItem>
                <SelectItem value="hidden">Hidden</SelectItem>
              </SelectContent>
            </Select>

            {filtersActive && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-xs text-muted-foreground hover:text-foreground"
                onClick={resetFilters}
              >
                Reset filters
              </Button>
            )}
          </>
        }
      />

      {error && <ErrorState message={error} onRetry={refetch} />}

      {loading && !data && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {!loading && data && reviews.length === 0 && (
        <EmptyState
          title={
            filtersActive ? "No reviews match those filters" : "No reviews yet"
          }
          hint={
            filtersActive
              ? "Try clearing the search or the visibility filter."
              : "Shopper reviews appear here as they are posted."
          }
          action={filtersActive ? (
            <Button variant="outline" onClick={resetFilters}>
              Clear filters
            </Button>
          ) : undefined}
        />
      )}

      {actionError && (
        <div
          role="alert"
          className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {actionError}
        </div>
      )}

      {reviews.length > 0 && (
        <>
          {/* Reviews are prose, so they render as cards at every width
              rather than squeezing into a table. */}
          <ul className="space-y-3">
            {reviews.map((review) => (
              <li
                key={review.id}
                className="rounded-2xl bg-card p-4 shadow-(--shadow-card)"
              >
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/products/${review.product_slug}`}
                        target="_blank"
                        className="group inline-flex max-w-full items-center gap-1.5 text-sm font-semibold hover:underline"
                      >
                        <span className="truncate">{review.product_title}</span>
                        <ExternalLink className="size-3 shrink-0 text-muted-foreground group-hover:text-foreground" />
                      </Link>
                      <Badge
                        variant={review.is_approved ? "secondary" : "warning"}
                        className="text-xs font-semibold"
                      >
                        {review.is_approved ? "Visible" : "Hidden"}
                      </Badge>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-0.5" aria-label={`${review.rating} out of 5 stars`}>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={
                              star <= review.rating
                                ? "size-3.5 fill-amber-400 text-amber-400"
                                : "size-3.5 text-muted-foreground/40"
                            }
                          />
                        ))}
                      </span>
                      <span className="font-medium text-foreground">
                        {review.reviewer}
                      </span>
                      <span aria-hidden="true">·</span>
                      <time dateTime={review.created_at}>
                        {formatDate(review.created_at)}
                      </time>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                      disabled={togglingId === review.id}
                      onClick={() => void toggleVisibility(review)}
                    >
                      {togglingId === review.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : review.is_approved ? (
                        <EyeOff className="size-3.5" />
                      ) : (
                        <Eye className="size-3.5" />
                      )}
                      {review.is_approved ? "Hide" : "Show"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive"
                      aria-label={`Delete ${review.reviewer}'s review of ${review.product_title}`}
                      onClick={() => {
                        setDeleteError(null);
                        setPendingDelete(review);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>

                {review.comment && (
                  <p className="mt-3 border-t border-border/50 pt-3 text-sm leading-relaxed text-muted-foreground">
                    {review.comment}
                  </p>
                )}
              </li>
            ))}
          </ul>

          <ListPagination
            page={page}
            count={data?.count ?? 0}
            pageSize={PAGE_SIZE}
            itemCount={reviews.length}
            onPageChange={setPage}
          />
        </>
      )}

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setPendingDelete(null);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Review</DialogTitle>
            <DialogDescription>
              Delete {pendingDelete?.reviewer}&rsquo;s review of &ldquo;
              {pendingDelete?.product_title}&rdquo;? Hiding it instead keeps it
              out of the shop without losing it. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p role="alert" className="text-xs text-destructive">
              {deleteError}
            </p>
          )}
          <DialogFooter className="mt-4 gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setPendingDelete(null);
                setDeleteError(null);
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void remove()}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
