"use client";

import { useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
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
import { ListPagination } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableSkeleton } from "@/components/admin/table-skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  CATEGORY_ICON_CHOICES,
  CategoryIcon,
} from "@/components/store/category-icon";
import { EmptyState, ErrorState, PageHeader } from "@/components/ui/states";
import { api, ApiError } from "@/lib/api";
import { useQuery } from "@/lib/use-query";
import type { Category, Paginated } from "@/lib/types";

const CATEGORY_COLUMNS = [
  { header: "Name", width: "w-[40%]" },
  { header: "Description", width: "w-[32%]" },
  { header: "Products", width: "w-[12%]" },
  { header: "Order", width: "w-[8%]" },
  { header: "Actions", width: "w-[8%]", align: "right" as const },
];

interface CategoryForm {
  id: number | null;
  name: string;
  description: string;
  icon: string;
  display_order: string;
}

const emptyForm: CategoryForm = {
  id: null,
  name: "",
  description: "",
  icon: "tag",
  display_order: "0",
};

const PAGE_SIZE = 10;

export default function AdminCategoriesPage() {
  const [page, setPage] = useState(1);
  const { data, error, loading, refetch } = useQuery<Paginated<Category>>(
    () =>
      api.get<Paginated<Category>>(
        `/api/v1/admin/categories/?page=${page}&page_size=${PAGE_SIZE}`,
      ),
    [page],
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
      icon: category.icon || "tag",
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
        icon: form.icon,
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
      // Step back a page rather than leaving an empty one behind.
      if (categories.length === 1 && page > 1) setPage(page - 1);
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
            <Button onClick={openCreate} className="gap-2">
              <Plus className="size-4" /> Add Category
            </Button>
          </div>
        }
      />

      {error && <ErrorState message={error} onRetry={refetch} />}

      {loading && !data && (
        <TableSkeleton columns={CATEGORY_COLUMNS} rowCount={5} />
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
        <div
          className={`space-y-4 transition-opacity duration-200 ${
            loading ? "opacity-60 pointer-events-none" : "opacity-100"
          }`}
        >
          <div className="space-y-3 md:hidden">
            {categories.map((category) => (
              <div
                key={category.id}
                className="rounded-2xl bg-card p-4 shadow-(--shadow-card)"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {category.name}
                    </p>
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
                  <TableRow
                    key={category.id}
                    className="transition-colors hover:bg-muted/50"
                  >
                    <TableCell className="truncate">
                      <div className="flex items-center gap-2">
                        <CategoryIcon
                          name={category.icon}
                          className="shrink-0 text-muted-foreground"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {category.name}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            /categories/{category.slug}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="truncate text-xs text-muted-foreground">
                      {category.description || "-"}
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

          <ListPagination
            page={page}
            count={data?.count ?? 0}
            pageSize={PAGE_SIZE}
            itemCount={categories.length}
            onPageChange={setPage}
          />
        </div>
      )}

      <Dialog
        open={form !== null}
        onOpenChange={(open) => !open && closeForm()}
      >
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
                <Label htmlFor="category-icon">Icon</Label>
                <Select
                  value={form.icon}
                  onValueChange={(value) => setForm({ ...form, icon: value })}
                >
                  <SelectTrigger id="category-icon" className="w-full">
                    <SelectValue placeholder="Icon" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_ICON_CHOICES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <span className="flex items-center gap-2">
                          <CategoryIcon name={option.value} />
                          {option.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Shown beside the category name in the storefront banner.
                </p>
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
            <Button
              onClick={() => void save()}
              disabled={saving}
              className="gap-1.5"
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              {saving
                ? "Saving…"
                : form?.id
                  ? "Save changes"
                  : "Create category"}
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
              className="gap-1.5"
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
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
