"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@/lib/use-query";
import type { AdminTeamMember, Paginated, UserRole } from "@/lib/types";

interface MemberForm {
  id: number | null;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  password: string;
}

const emptyForm: MemberForm = {
  id: null,
  username: "",
  email: "",
  first_name: "",
  last_name: "",
  role: "staff",
  password: "",
};

function RoleBadge({ role }: { role: UserRole }) {
  if (role === "admin") {
    return <Badge className="text-xs font-semibold">Admin</Badge>;
  }
  return (
    <Badge variant="secondary" className="text-xs font-semibold">
      Staff
    </Badge>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "Never"
    : d.toLocaleDateString("en-KE", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}

const PAGE_SIZE = 10;

export default function AdminTeamPage() {
  const { user: me } = useAuth();
  // Only admins may change the team; staff get a read-only view.
  const canManage = Boolean(me && (me.role === "admin" || me.is_superuser));

  const [page, setPage] = useState(1);
  const { data, error, loading, refetch } = useQuery<Paginated<AdminTeamMember>>(
    () =>
      api.get<Paginated<AdminTeamMember>>(
        `/api/v1/admin/team/?page=${page}&page_size=${PAGE_SIZE}`,
      ),
    [page],
  );

  const [form, setForm] = useState<MemberForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminTeamMember | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const members = data?.results ?? [];

  const isSelf = (member: AdminTeamMember) => member.id === me?.id;

  const openCreate = () => {
    setForm({ ...emptyForm });
    setFormError(null);
  };

  const openEdit = (member: AdminTeamMember) => {
    setForm({
      id: member.id,
      username: member.username,
      email: member.email,
      first_name: member.first_name,
      last_name: member.last_name,
      role: member.role,
      password: "",
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
    const username = form.username.trim();
    const email = form.email.trim();
    if (!username || !email) {
      setFormError("Username and email are required.");
      return;
    }
    if (!form.id && form.password.length < 8) {
      setFormError("Password must be at least 8 characters.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload: Record<string, unknown> = {
        username,
        email,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        role: form.role,
      };
      if (form.password) payload.password = form.password;

      if (form.id) {
        await api.patch(`/api/v1/admin/team/${form.id}/`, payload);
      } else {
        await api.post("/api/v1/admin/team/", payload);
      }
      setForm(null);
      refetch();
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Could not save this teammate.",
      );
    } finally {
      setSaving(false);
    }
  };

  const patchMember = async (
    member: AdminTeamMember,
    changes: Record<string, unknown>,
  ) => {
    if (busyId !== null) return;
    setBusyId(member.id);
    try {
      await api.patch(`/api/v1/admin/team/${member.id}/`, changes);
      refetch();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Could not update this teammate.",
      );
      refetch();
    } finally {
      setBusyId(null);
    }
  };

  const remove = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(`/api/v1/admin/team/${pendingDelete.id}/`);
      setPendingDelete(null);
      // Don't strand the view on an emptied trailing page.
      if (members.length === 1 && page > 1) setPage(page - 1);
      refetch();
    } catch (err) {
      setDeleteError(
        err instanceof ApiError
          ? err.message
          : "Could not remove this teammate.",
      );
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Workspace"
        title="Team"
        description={
          data
            ? `${data.count.toLocaleString()} ${data.count === 1 ? "account" : "accounts"} can reach this dashboard`
            : "Who can reach the dashboard"
        }
        action={
          canManage ? (
            <Button onClick={openCreate} className="gap-2">
              <Plus className="size-4" /> Add Teammate
            </Button>
          ) : undefined
        }
      />

      {error && <ErrorState message={error} onRetry={refetch} />}

      {loading && !data && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      )}

      {!loading && data && members.length === 0 && (
        <EmptyState
          title="No team accounts yet"
          hint="Add the people who help run the shop."
          action={
            canManage ? (
              <Button onClick={openCreate} className="gap-2">
                <Plus className="size-4" /> Add Teammate
              </Button>
            ) : undefined
          }
        />
      )}

      {members.length > 0 && (
        <>
          <div className="space-y-3 md:hidden">
            {members.map((member) => (
              <div
                key={member.id}
                className="rounded-2xl bg-card p-4 shadow-(--shadow-card)"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {member.display_name}
                      {isSelf(member) && (
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                          (you)
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {member.email}
                    </p>
                  </div>
                  <RoleBadge role={member.role} />
                </div>

                <div className="mt-3 flex items-center justify-between gap-1 border-t border-border/50 pt-3">
                  <Badge
                    variant={member.is_active ? "secondary" : "outline"}
                    className="text-xs"
                  >
                    {member.is_active ? "Active" : "Deactivated"}
                  </Badge>
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-xs"
                        disabled={isSelf(member)}
                        onClick={() => openEdit(member)}
                      >
                        <Pencil className="size-3.5" /> Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive"
                        disabled={isSelf(member)}
                        aria-label={`Remove ${member.display_name}`}
                        onClick={() => {
                          setDeleteError(null);
                          setPendingDelete(member);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-2xl bg-card shadow-(--shadow-card) md:block">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="w-[28%] font-semibold text-xs">
                    Name
                  </TableHead>
                  <TableHead className="w-[26%] font-semibold text-xs">
                    Email
                  </TableHead>
                  <TableHead className="w-[13%] font-semibold text-xs">
                    Role
                  </TableHead>
                  <TableHead className="w-[13%] font-semibold text-xs">
                    Status
                  </TableHead>
                  <TableHead className="w-[10%] font-semibold text-xs">
                    Last login
                  </TableHead>
                  <TableHead className="w-[10%] text-right font-semibold text-xs">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow
                    key={member.id}
                    className="transition-colors hover:bg-muted/50"
                  >
                    <TableCell className="truncate">
                      <p className="truncate text-sm font-medium">
                        {member.display_name}
                        {isSelf(member) && (
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                            (you)
                          </span>
                        )}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        @{member.username}
                      </p>
                    </TableCell>
                    <TableCell className="truncate text-xs text-muted-foreground">
                      {member.email}
                    </TableCell>
                    <TableCell>
                      {canManage && !isSelf(member) ? (
                        <Select
                          value={member.role}
                          onValueChange={(value) =>
                            void patchMember(member, { role: value })
                          }
                        >
                          <SelectTrigger
                            className="h-8 w-[95px] text-xs"
                            disabled={busyId === member.id}
                            aria-label={`Role for ${member.display_name}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="staff">Staff</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <RoleBadge role={member.role} />
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={member.is_active}
                          disabled={
                            !canManage || isSelf(member) || busyId === member.id
                          }
                          aria-label={`${member.is_active ? "Deactivate" : "Activate"} ${member.display_name}`}
                          onCheckedChange={(checked) =>
                            void patchMember(member, { is_active: checked })
                          }
                        />
                        <span className="text-xs text-muted-foreground">
                          {member.is_active ? "Active" : "Off"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs tabular-nums text-muted-foreground">
                      {formatDate(member.last_login)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {canManage && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              disabled={isSelf(member)}
                              aria-label={`Edit ${member.display_name}`}
                              onClick={() => openEdit(member)}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-destructive"
                              disabled={isSelf(member)}
                              aria-label={`Remove ${member.display_name}`}
                              onClick={() => {
                                setDeleteError(null);
                                setPendingDelete(member);
                              }}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </>
                        )}
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
            itemCount={members.length}
            onPageChange={setPage}
          />
        </>
      )}

      <Dialog open={form !== null} onOpenChange={(open) => !open && closeForm()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {form?.id ? "Edit Teammate" : "Add Teammate"}
            </DialogTitle>
            <DialogDescription>
              {form?.id
                ? "Change their details, role, or set a new password."
                : "They can sign in with these details straight away."}
            </DialogDescription>
          </DialogHeader>

          {form && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="team-first">First name</Label>
                  <Input
                    id="team-first"
                    value={form.first_name}
                    onChange={(e) =>
                      setForm({ ...form, first_name: e.target.value })
                    }
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="team-last">Last name</Label>
                  <Input
                    id="team-last"
                    value={form.last_name}
                    onChange={(e) =>
                      setForm({ ...form, last_name: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="team-username">Username</Label>
                <Input
                  id="team-username"
                  value={form.username}
                  onChange={(e) =>
                    setForm({ ...form, username: e.target.value })
                  }
                  disabled={Boolean(form.id)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="team-email">Email</Label>
                <Input
                  id="team-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select
                    value={form.role}
                    onValueChange={(value) =>
                      setForm({ ...form, role: value as UserRole })
                    }
                  >
                    <SelectTrigger className="w-full h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="team-password">Password</Label>
                  <Input
                    id="team-password"
                    type="password"
                    value={form.password}
                    onChange={(e) =>
                      setForm({ ...form, password: e.target.value })
                    }
                    placeholder={form.id ? "Keep current" : "At least 8 chars"}
                  />
                </div>
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
              {saving ? "Saving…" : form?.id ? "Save changes" : "Add teammate"}
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
            <DialogTitle>Remove Teammate</DialogTitle>
            <DialogDescription>
              Remove &ldquo;{pendingDelete?.display_name}&rdquo; from the team?
              They lose dashboard access immediately. Their past activity on
              orders stays. This cannot be undone.
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
              {deleting ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
