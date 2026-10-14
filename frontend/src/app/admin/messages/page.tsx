"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Mail,
  MailOpen,
  Phone,
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
import { ListPagination } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, PageHeader } from "@/components/ui/states";
import { FilterSearch, FilterToolbar } from "@/components/admin/filter-toolbar";
import { api, ApiError } from "@/lib/api";
import { useQuery } from "@/lib/use-query";
import type { ContactMessage, Paginated } from "@/lib/types";

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
        hour: "2-digit",
        minute: "2-digit",
      });
}

export default function AdminMessagesPage() {
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [status, setStatus] = useState(ALL);
  const [page, setPage] = useState(1);

  const [selectedMessage, setSelectedMessage] = useState<ContactMessage | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<ContactMessage | null>(null);
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

  const { data, error, loading, refetch } = useQuery<Paginated<ContactMessage>>(
    () => api.get<Paginated<ContactMessage>>(`/api/v1/admin/contact-messages/?${query}`),
    [query],
  );

  const messages = data?.results ?? [];
  const filtersActive = Boolean(appliedSearch) || status !== ALL;

  const resetFilters = () => {
    setSearch("");
    setAppliedSearch("");
    setStatus(ALL);
    setPage(1);
  };

  const toggleRead = async (msg: ContactMessage, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (togglingId !== null) return;
    setTogglingId(msg.id);
    setActionError(null);
    try {
      const updated = await api.patch<ContactMessage>(`/api/v1/admin/contact-messages/${msg.id}/`, {
        is_read: !msg.is_read,
      });
      if (selectedMessage?.id === msg.id) {
        setSelectedMessage(updated);
      }
      refetch();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Could not update this message.",
      );
    } finally {
      setTogglingId(null);
    }
  };

  const viewMessage = (msg: ContactMessage) => {
    setSelectedMessage(msg);
    if (!msg.is_read) {
      api.patch<ContactMessage>(`/api/v1/admin/contact-messages/${msg.id}/`, { is_read: true })
        .then((updated) => {
          setSelectedMessage(updated);
          refetch();
        })
        .catch(() => {});
    }
  };

  // Header-bell deep link (?message=<id>): open it once the first page
  // arrives; opening marks it read.
  const attemptedDeepLink = useRef(false);
  useEffect(() => {
    if (attemptedDeepLink.current || !data) return;
    const idParam = new URLSearchParams(window.location.search).get("message");
    if (!idParam) return;
    attemptedDeepLink.current = true;
    const target = messages.find((m) => m.id === Number(idParam));
    if (!target) return;
    // Defer past the effect pass (react-hooks/set-state-in-effect): open
    // on the next frame, once the list has painted.
    const frame = requestAnimationFrame(() => viewMessage(target));
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const remove = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(`/api/v1/admin/contact-messages/${pendingDelete.id}/`);
      if (selectedMessage?.id === pendingDelete.id) {
        setSelectedMessage(null);
      }
      setPendingDelete(null);
      refetch();
    } catch (err) {
      setDeleteError(
        err instanceof ApiError ? err.message : "Could not delete this message.",
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Customer Care"
        title="Messages"
        description={
          data
            ? `${data.count.toLocaleString()} ${data.count === 1 ? "inquiry" : "inquiries"} submitted`
            : "Customer inquiries and contact messages"
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
            placeholder="Search name, email, subject or message…"
          />
        }
        filters={
          <>
            <Select
              value={status}
              onValueChange={(val) => {
                setStatus(val);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[140px] h-9 text-xs">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL} className="text-xs">All Messages</SelectItem>
                <SelectItem value="unread" className="text-xs">Unread</SelectItem>
                <SelectItem value="read" className="text-xs">Read</SelectItem>
              </SelectContent>
            </Select>

            {filtersActive && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="h-9 text-xs text-muted-foreground hover:text-foreground"
              >
                Clear filters
              </Button>
            )}
          </>
        }
      />

      {actionError && (
        <p className="text-xs font-medium text-destructive">{actionError}</p>
      )}

      {loading && !data ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-md" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : messages.length === 0 ? (
        <EmptyState
          title={filtersActive ? "No matching messages" : "Inbox is empty"}
          hint={
            filtersActive
              ? "Try adjusting your search query or status filter."
              : "Messages submitted via the contact form will appear here."
          }
          action={
            filtersActive ? (
              <Button size="sm" variant="outline" onClick={resetFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-lg border bg-card divide-y">
          {messages.map((msg) => (
            <div
              key={msg.id}
              onClick={() => viewMessage(msg)}
              className={`p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-muted/50 cursor-pointer transition-colors ${
                !msg.is_read ? "bg-primary/5 font-medium" : ""
              }`}
            >
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {!msg.is_read ? (
                    <Badge variant="default" className="text-[10px] bg-primary text-primary-foreground font-semibold px-1.5 py-0">
                      Unread
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground font-normal px-1.5 py-0">
                      Read
                    </Badge>
                  )}
                  <span className="text-sm font-semibold">{msg.name}</span>
                  <span className="text-xs text-muted-foreground">&lt;{msg.email}&gt;</span>
                  {msg.phone && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Phone className="size-3" />
                      {msg.phone}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto hidden sm:inline">
                    {formatDate(msg.created_at)}
                  </span>
                </div>
                <p className="text-sm text-foreground truncate">{msg.subject}</p>
                <p className="text-xs text-muted-foreground line-clamp-1">{msg.message}</p>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 cursor-pointer"
                  title={msg.is_read ? "Mark as unread" : "Mark as read"}
                  onClick={(e) => toggleRead(msg, e)}
                  disabled={togglingId === msg.id}
                >
                  {msg.is_read ? (
                    <Mail className="size-4 text-muted-foreground" />
                  ) : (
                    <MailOpen className="size-4 text-primary" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-destructive hover:bg-destructive/10 cursor-pointer"
                  title="Delete message"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingDelete(msg);
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {data && data.count > PAGE_SIZE && (
        <ListPagination
          page={page}
          count={data.count}
          pageSize={PAGE_SIZE}
          itemCount={messages.length}
          onPageChange={setPage}
        />
      )}

      <Dialog
        open={Boolean(selectedMessage)}
        onOpenChange={(open) => {
          if (!open) setSelectedMessage(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              {selectedMessage?.subject}
            </DialogTitle>
            <DialogDescription className="text-xs space-y-1 pt-1">
              <div className="flex items-center justify-between">
                <span>From: <strong>{selectedMessage?.name}</strong></span>
                <span>{selectedMessage && formatDate(selectedMessage.created_at)}</span>
              </div>
              <div>Email: <a href={`mailto:${selectedMessage?.email}`} className="text-primary hover:underline">{selectedMessage?.email}</a></div>
              {selectedMessage?.phone && (
                <div>Phone: <a href={`tel:${selectedMessage.phone}`} className="text-primary hover:underline">{selectedMessage.phone}</a></div>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="my-2 p-3 rounded-md bg-muted/60 text-sm whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
            {selectedMessage?.message}
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between w-full">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (selectedMessage) toggleRead(selectedMessage);
              }}
              className="text-xs"
            >
              {selectedMessage?.is_read ? "Mark as Unread" : "Mark as Read"}
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => {
                  setPendingDelete(selectedMessage);
                }}
                className="text-xs"
              >
                Delete
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => setSelectedMessage(null)}
                className="text-xs"
              >
                Close
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Delete message?</DialogTitle>
            <DialogDescription className="text-xs">
              This message from <strong>{pendingDelete?.name}</strong> will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p className="text-xs font-medium text-destructive">{deleteError}</p>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPendingDelete(null)}
              disabled={deleting}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={remove}
              disabled={deleting}
              className="text-xs"
            >
              {deleting ? (
                <>
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
