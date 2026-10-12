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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, ErrorState, PageHeader } from "@/components/admin/states";
import { api, ApiError } from "@/lib/api";
import { useQuery } from "@/lib/use-query";
import type { Category, Paginated } from "@/lib/types";

interface CategoryForm {
  id: number | null;
  name: string;
  description: string;
  display_order: string;
}

const emptyForm: CategoryForm = {
  id: null,
  name: "",
  description: "",
  display_order: "0",
};

export default function AdminCategoriesPage() {
  const { data, error, loading, refetch } = useQuery<Paginated<Category>>(() =>
    api.get<Paginated<Category>>("/api/v1/admin/categories/?page_size=100"),
  );

  // null = dialog closed; otherwise the row being created (id null) or edited.
  const [form, setForm] = useState<CategoryForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const categories = data?.results ?? [];

  const openCreate = () => {
    setForm({ ...emptyForm });
    setFormError(null);
  };

  const openEdit = (category: Category) => {
    setForm({
      id: category.id,
      name: category.name,
      description: category.description,
      display_order: String(category.display_order),
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
    const name = form.name.trim();
    if (!name) {
      setFormError("A name is required.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name,
        description: form.description.trim(),
        display_order: Number(form.display_order) || 0,
      };
      if (form.id) {
        await api.patch(`/api/v1/admin/categories/${form.id}/`, payload);
      } else {
        await api.post("/api/v1/admin/categories/", payload);
      }
      setForm(null);
      refetch();
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Could not save the category.",
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(`/api/v1/admin/categories/${pendingDelete.id}/`);
      setPendingDelete(null);
      refetch();
    } catch (err) {
      setDeleteError(
        err instanceof ApiError
          ? err.message
          : "Could not delete this category.",
      );
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Catalog"
        title="Categories"
        description={
          data
            ? `${data.count.toLocaleString()} ${data.count === 1 ? "category" : "categories"} organising the storefront`
            : "Organise the storefront into browsable sections"
        }
        action={
          <Button onClick={openCreate} className="gap-2">
            <Plus className="size-4" /> Add Category
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

      {!loading && data && categories.length === 0 && (
        <EmptyState
          title="No categories yet"
          hint="Add your first category to start organising products."
          action={
            <Button onClick={openCreate} className="gap-2">
              <Plus className="size-4" /> Add Category
            </Button>
          }
        />
      )}

      {categories.length > 0 && (
        <>
          {/* Mobile: card list */}
          <div className="space-y-3 md:hidden">
            {categories.map((category) => (
              <div
                key={category.id}
                className="rounded-2xl bg-card p-4 shadow-(--shadow-card)"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{category.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      /categories/{category.slug}
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className="shrink-0 text-xs font-semibold tabular-nums"
                  >
                    {category.product_count}{" "}
                    {category.product_count === 1 ? "product" : "products"}
                  </Badge>
                </div>

                <div className="mt-3 flex items-center justify-end gap-1 border-t border-border/50 pt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => openEdit(category)}
                  >
                    <Pencil className="size-3.5" /> Edit
                  </Button>
                  <DeleteButton
                    category={category}
                    onClick={() => {
                      setDeleteError(null);
                      setPendingDelete(category);
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden overflow-hidden rounded-2xl bg-card shadow-(--shadow-card) md:block">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="w-[40%] font-semibold text-xs">
                    Name
                  </TableHead>
                  <TableHead className="w-[32%] font-semibold text-xs">
                    Description
                  </TableHead>
                  <TableHead className="w-[12%] font-semibold text-xs">
                    Products
                  </TableHead>
                  <TableHead className="w-[8%] font-semibold text-xs">
                    Order
                  </TableHead>
                  <TableHead className="w-[8%] text-right font-semibold text-xs">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((category) => (
                  <TableRow key={category.id} className="transition-colors hover:bg-muted/50">
                    <TableCell className="truncate">
                      <p className="truncate text-sm font-medium">{category.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        /categories/{category.slug}
                      </p>
                    </TableCell>
                    <TableCell className="truncate text-xs text-muted-foreground">
                      {category.description || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className="text-xs font-semibold tabular-nums"
                      >
                        {category.product_count}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs tabular-nums text-muted-foreground">
                      {category.display_order}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={`Edit ${category.name}`}
                          onClick={() => openEdit(category)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <DeleteButton
                          category={category}
                          onClick={() => {
                            setDeleteError(null);
                            setPendingDelete(category);
                          }}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* Create / edit */}
      <Dialog open={form !== null} onOpenChange={(open) => !open && closeForm()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {form?.id ? "Edit Category" : "New Category"}
            </DialogTitle>
            <DialogDescription>
              The URL slug is generated from the name and stays put when you
              rename later, so links never break.
            </DialogDescription>
          </DialogHeader>

          {form && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="category-name">Name</Label>
                <Input
                  id="category-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Jeans"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="category-description">Description</Label>
                <Textarea
                  id="category-description"
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  placeholder="Shown on the category page (optional)"
                  rows={3}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="category-order">Display order</Label>
                <Input
                  id="category-order"
                  type="number"
                  min={0}
                  value={form.display_order}
                  onChange={(e) =>
                    setForm({ ...form, display_order: e.target.value })
                  }
                  className="w-28"
                />
                <p className="text-xs text-muted-foreground">
                  Lower numbers appear first in the storefront navigation.
                </p>
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
              {saving ? "Saving…" : form?.id ? "Save changes" : "Create category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
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
            <DialogTitle>Delete Category</DialogTitle>
            <DialogDescription>
              Delete &ldquo;{pendingDelete?.name}&rdquo;? This cannot be undone.
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

/** Trash button - inert while products still point at the category. */
function DeleteButton({
  category,
  onClick,
}: {
  category: Category;
  onClick: () => void;
}) {
  const inUse = category.product_count > 0;
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8 text-destructive"
      disabled={inUse}
      title={
        inUse
          ? `Move or delete its ${category.product_count} product(s) first`
          : `Delete ${category.name}`
      }
      aria-label={
        inUse
          ? `${category.name} still has products and cannot be deleted`
          : `Delete ${category.name}`
      }
      onClick={onClick}
    >
      <Trash2 className="size-3.5" />
    </Button>
  );
}
