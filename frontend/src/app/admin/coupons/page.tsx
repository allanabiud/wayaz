"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListPagination } from "@/components/ui/list-pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, ErrorState, PageHeader } from "@/components/admin/states";
import { api, ApiError } from "@/lib/api";
import { useQuery } from "@/lib/use-query";
import type { AdminCoupon, Paginated } from "@/lib/types";

interface CouponForm {
  id: number | null;
  code: string;
  discount_type: "percent" | "fixed";
  discount_value: string;
  is_active: boolean;
  audience: AdminCoupon["audience"];
  auto_apply: boolean;
}

const emptyForm: CouponForm = {
  id: null,
  code: "",
  discount_type: "percent",
  discount_value: "",
  is_active: true,
  audience: "everyone",
  auto_apply: false,
};

const AUDIENCE_LABELS: Record<AdminCoupon["audience"], string> = {
  everyone: "Everyone",
  guests: "Guests only",
  first_order: "First-time customers",
};

/** "Auto-applies · Guests only" - only shown when it adds information. */
function reachLine(coupon: AdminCoupon): string | null {
  if (!coupon.auto_apply && coupon.audience === "everyone") return null;
  return `${coupon.auto_apply ? "Auto-applies" : "Manual"} · ${AUDIENCE_LABELS[coupon.audience]}`;
}

function formatDiscount(coupon: AdminCoupon): string {
  const value = Number(coupon.discount_value);
  const pretty = Number.isFinite(value) ? value.toLocaleString("en-KE") : coupon.discount_value;
  return coupon.discount_type === "percent" ? `${pretty}%` : `Ksh ${pretty}`;
}

const PAGE_SIZE = 10;

export default function AdminCouponsPage() {
  const [page, setPage] = useState(1);
  const { data, error, loading, refetch } = useQuery<Paginated<AdminCoupon>>(
    () =>
      api.get<Paginated<AdminCoupon>>(
        `/api/v1/admin/orders/coupons/?page=${page}&page_size=${PAGE_SIZE}`,
      ),
    [page],
  );

  // null = dialog closed; otherwise the row being created (id null) or edited.
  const [form, setForm] = useState<CouponForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminCoupon | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const coupons = data?.results ?? [];

  const openCreate = () => {
    setForm({ ...emptyForm });
    setFormError(null);
  };

  const openEdit = (coupon: AdminCoupon) => {
    setForm({
      id: coupon.id,
      code: coupon.code,
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value,
      is_active: coupon.is_active,
      audience: coupon.audience,
      auto_apply: coupon.auto_apply,
    });
    setFormError(null);
  };

  const closeForm = () => {
    if (saving) return;
    setForm(null);
    setFormError(null);
  };

  const save = async () => {
    if (!form || saving) return;
    const code = form.code.trim();
    const value = Number(form.discount_value);
    if (!code) {
      setFormError("A code is required.");
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      setFormError("The discount must be greater than zero.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        code,
        discount_type: form.discount_type,
        discount_value: String(value),
        is_active: form.is_active,
        audience: form.audience,
        auto_apply: form.auto_apply,
      };
      if (form.id) {
        await api.patch(`/api/v1/admin/orders/coupons/${form.id}/`, payload);
      } else {
        await api.post("/api/v1/admin/orders/coupons/", payload);
      }
      setForm(null);
      refetch();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not save the coupon.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (coupon: AdminCoupon) => {
    if (togglingId !== null) return;
    setTogglingId(coupon.id);
    try {
      await api.patch(`/api/v1/admin/orders/coupons/${coupon.id}/`, {
        is_active: !coupon.is_active,
      });
      refetch();
    } catch {
      // The list refetch on the next action shows the true state.
    } finally {
      setTogglingId(null);
    }
  };

  const remove = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(`/api/v1/admin/orders/coupons/${pendingDelete.id}/`);
      setPendingDelete(null);
      // Don't strand the view on an emptied trailing page.
      if (coupons.length === 1 && page > 1) setPage(page - 1);
      refetch();
    } catch (err) {
      setDeleteError(
        err instanceof ApiError ? err.message : "Could not delete this coupon.",
      );
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Promotions"
        title="Coupons"
        description={
          data
            ? `${data.count.toLocaleString()} ${data.count === 1 ? "code" : "codes"} shoppers can apply at checkout`
            : "Percent or fixed discounts applied at checkout"
        }
        action={
          <Button onClick={openCreate} className="gap-2">
            <Plus className="size-4" /> Add Coupon
          </Button>
        }
      />

      {error && <ErrorState message={error} onRetry={refetch} />}

      {loading && !data && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      )}

      {!loading && data && coupons.length === 0 && (
        <EmptyState
          title="No coupons yet"
          hint="Create a percent or fixed code to run a promotion."
          action={
            <Button onClick={openCreate} className="gap-2">
              <Plus className="size-4" /> Add Coupon
            </Button>
          }
        />
      )}

      {coupons.length > 0 && (
        <>
          <div className="space-y-3 md:hidden">
            {coupons.map((coupon) => (
              <div
                key={coupon.id}
                className="rounded-2xl bg-card p-4 shadow-(--shadow-card)"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm font-semibold">
                      {coupon.code}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDiscount(coupon)} · used {coupon.order_count}{" "}
                      {coupon.order_count === 1 ? "time" : "times"}
                    </p>
                    {reachLine(coupon) && (
                      <p className="text-[11px] text-muted-foreground">
                        {reachLine(coupon)}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant={coupon.is_active ? "secondary" : "outline"}
                    className="shrink-0 text-xs font-semibold"
                  >
                    {coupon.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>

                <div className="mt-3 flex items-center justify-end gap-1 border-t border-border/50 pt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => void toggleActive(coupon)}
                    disabled={togglingId === coupon.id}
                  >
                    {coupon.is_active ? "Deactivate" : "Activate"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => openEdit(coupon)}
                  >
                    <Pencil className="size-3.5" /> Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-destructive"
                    aria-label={`Delete ${coupon.code}`}
                    onClick={() => {
                      setDeleteError(null);
                      setPendingDelete(coupon);
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-2xl bg-card shadow-(--shadow-card) md:block">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="w-[30%] font-semibold text-xs">
                    Code
                  </TableHead>
                  <TableHead className="w-[18%] font-semibold text-xs">
                    Discount
                  </TableHead>
                  <TableHead className="w-[14%] font-semibold text-xs">
                    Status
                  </TableHead>
                  <TableHead className="w-[12%] font-semibold text-xs">
                    Used
                  </TableHead>
                  <TableHead className="w-[26%] text-right font-semibold text-xs">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coupons.map((coupon) => (
                  <TableRow
                    key={coupon.id}
                    className="transition-colors hover:bg-muted/50"
                  >
                    <TableCell className="truncate">
                      <p className="truncate font-mono text-sm font-semibold">
                        {coupon.code}
                      </p>
                      {reachLine(coupon) && (
                        <p className="truncate text-[10px] text-muted-foreground">
                          {reachLine(coupon)}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {formatDiscount(coupon)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={coupon.is_active ? "secondary" : "outline"}
                        className="text-xs font-semibold"
                      >
                        {coupon.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs tabular-nums text-muted-foreground">
                      {coupon.order_count}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Switch
                          checked={coupon.is_active}
                          disabled={togglingId === coupon.id}
                          aria-label={`${coupon.is_active ? "Deactivate" : "Activate"} ${coupon.code}`}
                          onCheckedChange={() => void toggleActive(coupon)}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={`Edit ${coupon.code}`}
                          onClick={() => openEdit(coupon)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive"
                          aria-label={`Delete ${coupon.code}`}
                          onClick={() => {
                            setDeleteError(null);
                            setPendingDelete(coupon);
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
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
            itemCount={coupons.length}
            onPageChange={setPage}
          />
        </>
      )}

      <Dialog open={form !== null} onOpenChange={(open) => !open && closeForm()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Edit Coupon" : "New Coupon"}</DialogTitle>
            <DialogDescription>
              Shoppers type the code at checkout - or let it apply itself
              for the carts you target. Codes are stored in capitals, so
              welcome10 and WELCOME10 are the same coupon.
            </DialogDescription>
          </DialogHeader>

          {form && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="coupon-code">Code</Label>
                <Input
                  id="coupon-code"
                  value={form.code}
                  onChange={(e) =>
                    setForm({ ...form, code: e.target.value.toUpperCase() })
                  }
                  placeholder="e.g. WELCOME10"
                  className="font-mono uppercase"
                  autoFocus
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1 space-y-1.5">
                  <Label>Discount type</Label>
                  <Select
                    value={form.discount_type}
                    onValueChange={(value) =>
                      setForm({
                        ...form,
                        discount_type: value as CouponForm["discount_type"],
                      })
                    }
                  >
                    <SelectTrigger className="w-full h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">Percentage (%)</SelectItem>
                      <SelectItem value="fixed">Fixed amount (Ksh)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="coupon-value">
                    {form.discount_type === "percent" ? "Percentage" : "Amount"}
                  </Label>
                  <Input
                    id="coupon-value"
                    type="number"
                    min={0}
                    step="0.01"
                    max={form.discount_type === "percent" ? 100 : undefined}
                    value={form.discount_value}
                    onChange={(e) =>
                      setForm({ ...form, discount_value: e.target.value })
                    }
                    placeholder={form.discount_type === "percent" ? "10" : "500"}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="coupon-audience">Who can use it</Label>
                <Select
                  value={form.audience}
                  onValueChange={(value) =>
                    setForm({
                      ...form,
                      audience: value as CouponForm["audience"],
                    })
                  }
                >
                  <SelectTrigger id="coupon-audience" className="w-full h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="everyone">Everyone</SelectItem>
                    <SelectItem value="guests">Guest carts only</SelectItem>
                    <SelectItem value="first_order">
                      First-time customers only
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Checked whether the code is typed or applied itself.
                  First-time means no orders yet - guest carts count as
                  first-time.
                </p>
              </div>

              <div className="flex items-center justify-between rounded-xl border p-3">
                <div>
                  <p className="text-sm font-medium">Apply automatically</p>
                  <p className="text-xs text-muted-foreground">
                    Claims eligible carts at checkout, so nobody has to
                    type it.
                  </p>
                </div>
                <Switch
                  checked={form.auto_apply}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, auto_apply: checked })
                  }
                  aria-label="Apply coupon automatically"
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border p-3">
                <div>
                  <p className="text-sm font-medium">Active</p>
                  <p className="text-xs text-muted-foreground">
                    Inactive codes are refused at checkout but kept for
                    history.
                  </p>
                </div>
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, is_active: checked })
                  }
                  aria-label="Coupon active"
                />
              </div>

              {formError && (
                <p role="alert" className="text-sm text-destructive">
                  {formError}
                </p>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeForm} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : form?.id ? "Save changes" : "Create coupon"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <DialogTitle>Delete Coupon</DialogTitle>
            <DialogDescription>
              Delete &ldquo;{pendingDelete?.code}&rdquo;? Orders that already
              used it keep their discount - only the code goes away. To stop
              it working, deactivate it instead. This cannot be undone.
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
