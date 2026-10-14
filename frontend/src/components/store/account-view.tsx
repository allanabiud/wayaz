"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ChevronRight,
  KeyRound,
  LogIn,
  MapPin,
  Pencil,
  Plus,
  Star,
  Trash2,
  UserRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { useAuth } from "@/lib/auth-context";
import { useStore } from "@/lib/store-context";
import { useQuery } from "@/lib/use-query";
import { ApiError } from "@/lib/api";
import { KENYAN_COUNTIES } from "@/lib/locations";
import {
  changePassword,
  createAddress,
  deleteAddress,
  fetchUserAddresses,
  fetchUserProfile,
  updateUserProfile,
  updateAddress,
  type AccountProfile,
} from "@/lib/store-api";
import type { Address, Paginated } from "@/lib/types";


function ProfileTab() {
  const { data: profile, error, loading, refetch } =
    useQuery<AccountProfile>(fetchUserProfile);

  if (loading && !profile) {
    return (
      <div className="space-y-3" aria-hidden="true">
        <div className="h-8 w-2/3 animate-pulse rounded-md bg-muted" />
        <div className="h-8 w-1/2 animate-pulse rounded-md bg-muted" />
        <div className="h-8 w-3/4 animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!profile) return null;

  return (
    <ProfileForm key={profile.id} profile={profile} onSaved={refetch} />
  );
}

function ProfileForm({
  profile,
  onSaved,
}: {
  profile: AccountProfile;
  onSaved: () => void;
}) {
  const { updateSessionUser } = useAuth();

  const [firstName, setFirstName] = useState(profile.first_name);
  const [lastName, setLastName] = useState(profile.last_name);
  const [email, setEmail] = useState(profile.email);
  const [phone, setPhone] = useState(profile.phone_number);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await updateUserProfile({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        phone_number: phone.trim(),
      });
      // Keep the header dropdown & session in sync with the edit.
      updateSessionUser({
        email: updated.email,
        phone_number: updated.phone_number,
        display_name: updated.display_name,
      });
      toast.success("Profile updated.");
      onSaved();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to update profile.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="firstName">First Name</Label>
          <Input
            id="firstName"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="e.g. Jane"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lastName">Last Name</Label>
          <Input
            id="lastName"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="e.g. Wanjiku"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="accountEmail">Email Address</Label>
          <Input
            id="accountEmail"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="e.g. jane@example.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="accountPhone">Phone Number</Label>
          <Input
            id="accountPhone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. 0712345678"
          />
          <p className="text-xs text-muted-foreground">
            Used for M-Pesa prompts and delivery calls.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2 text-sm">
        <span className="text-muted-foreground">Username</span>
        <span className="font-medium">{profile.username}</span>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={saving} className="gap-2">
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}


function PasswordTab() {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }
    setSaving(true);
    try {
      await changePassword(oldPassword, newPassword);
      toast.success("Password changed successfully.");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to change password.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="oldPassword">Current Password</Label>
        <Input
          id="oldPassword"
          type="password"
          required
          autoComplete="current-password"
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="newPassword">New Password</Label>
          <Input
            id="newPassword"
            type="password"
            required
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">Confirm New Password</Label>
          <Input
            id="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={saving} className="gap-2">
          <KeyRound className="size-4" aria-hidden="true" />
          {saving ? "Updating..." : "Update Password"}
        </Button>
      </div>
    </form>
  );
}


const EMPTY_ADDRESS = {
  full_name: "",
  phone_number: "",
  county: "Nairobi",
  town: "",
  street_address: "",
  is_default: false,
};

function AddressDialog({
  open,
  onOpenChange,
  address,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  address: Address | null;
  onSaved: () => void;
}) {
  // Only mounted while open, so the keyed form re-seeds on every open.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open && (
          <AddressForm
            key={address?.id ?? "new"}
            address={address}
            onCancel={() => onOpenChange(false)}
            onSaved={() => {
              onOpenChange(false);
              onSaved();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddressForm({
  address,
  onCancel,
  onSaved,
}: {
  address: Address | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(
    address
      ? {
          full_name: address.full_name,
          phone_number: address.phone_number,
          county: address.county,
          town: address.town,
          street_address: address.street_address,
          is_default: address.is_default,
        }
      : EMPTY_ADDRESS,
  );
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof typeof EMPTY_ADDRESS>(
    key: K,
    value: (typeof EMPTY_ADDRESS)[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (address) {
        await updateAddress(address.id, form);
        toast.success("Address updated.");
      } else {
        await createAddress(form);
        toast.success("Address saved.");
      }
      onSaved();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to save address.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{address ? "Edit Address" : "Add Address"}</DialogTitle>
        <DialogDescription>
          {address
            ? "Update this saved delivery address."
            : "Save a delivery address for faster checkout next time."}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="addrName">Full Name</Label>
            <Input
              id="addrName"
              required
              value={form.full_name}
              onChange={(e) => set("full_name", e.target.value)}
              placeholder="e.g. Jane Wanjiku"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="addrPhone">Phone Number</Label>
            <Input
              id="addrPhone"
              type="tel"
              required
              value={form.phone_number}
              onChange={(e) => set("phone_number", e.target.value)}
              placeholder="e.g. 0712345678"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="addrCounty">County</Label>
            <Select
              value={form.county}
              onValueChange={(value) => set("county", value)}
            >
              <SelectTrigger id="addrCounty" className="w-full">
                <SelectValue placeholder="Select County" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {KENYAN_COUNTIES.map((county) => (
                  <SelectItem key={county} value={county}>
                    {county}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="addrTown">Town / Area</Label>
            <Input
              id="addrTown"
              required
              value={form.town}
              onChange={(e) => set("town", e.target.value)}
              placeholder="e.g. Westlands"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="addrStreet">Street Address / House / Building</Label>
            <Input
              id="addrStreet"
              required
              value={form.street_address}
              onChange={(e) => set("street_address", e.target.value)}
              placeholder="e.g. Delta Towers, 4th Floor"
            />
          </div>
        </div>

        <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <span className="text-sm">
            <span className="font-medium">Set as default</span>
            <span className="block text-xs text-muted-foreground">
              Pre-selected at checkout.
            </span>
          </span>
          <Switch
            checked={form.is_default}
            onCheckedChange={(checked) => set("is_default", checked)}
          />
        </label>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : address ? "Save Changes" : "Add Address"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

function AddressesTab() {
  const { data, error, loading, refetch } = useQuery<Paginated<Address>>(
    fetchUserAddresses,
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Address | null>(null);
  const [deleting, setDeleting] = useState<Address | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  const addresses = data?.results ?? [];

  const handleSetDefault = async (address: Address) => {
    try {
      await updateAddress(address.id, { is_default: true });
      toast.success("Default address updated.");
      refetch();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to update address.",
      );
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteSaving(true);
    try {
      await deleteAddress(deleting.id);
      toast.success("Address removed.");
      setDeleting(null);
      refetch();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to delete address.",
      );
    } finally {
      setDeleteSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Saved delivery addresses are shown at checkout - pick one and go.
        </p>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add Address
        </Button>
      </div>

      {loading && !data ? (
        <div className="space-y-3" aria-hidden="true">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : addresses.length === 0 ? (
        <EmptyState
          title="No saved addresses yet"
          hint="Add a delivery address so checkout is one tap next time."
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              Add your first address
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {addresses.map((address) => (
            <li
              key={address.id}
              className="rounded-xl border bg-card p-4 shadow-xs"
            >
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                <div className="flex items-center gap-2">
                  <MapPin className="size-4 text-primary" aria-hidden="true" />
                  <span className="text-sm font-semibold">{address.full_name}</span>
                  {address.is_default && (
                    <Badge
                      variant="outline"
                      className="gap-1 text-[10px] font-semibold uppercase text-primary border-primary/30"
                    >
                      <Star className="size-3" aria-hidden="true" />
                      Default
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {!address.is_default && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => handleSetDefault(address)}
                    >
                      <Star className="size-3.5" aria-hidden="true" />
                      Set default
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => {
                      setEditing(address);
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil className="size-3.5" aria-hidden="true" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                    onClick={() => setDeleting(address)}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    Delete
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {address.street_address}, {address.town}, {address.county}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {address.phone_number}
              </p>
            </li>
          ))}
        </ul>
      )}

      <AddressDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        address={editing}
        onSaved={refetch}
      />

      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove this address?</DialogTitle>
            <DialogDescription>
              {deleting
                ? `${deleting.street_address}, ${deleting.town} will be removed from your account.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteSaving}
              onClick={handleDelete}
            >
              {deleteSaving ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


export function AccountView() {
  const { ready, isAuthenticated } = useAuth();
  const { openLogin } = useStore();

  if (!ready) return null;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        <Link
          href="/"
          className="rounded-sm outline-none transition-colors hover:text-foreground"
        >
          Home
        </Link>
        <ChevronRight className="size-3.5" aria-hidden="true" />
        <span className="font-medium text-foreground">Account</span>
      </nav>

      <div className="mt-4">
        <p className="text-xs font-semibold tracking-[0.2em] text-gold uppercase">
          Your account
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          My Account
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your details, password, and saved delivery addresses.
        </p>
      </div>

      <div className="mt-6">
        {!isAuthenticated ? (
          <EmptyState
            title="Sign in to manage your account"
            hint="Your profile and saved addresses are tied to your Wayaz account."
            action={
              <Button size="sm" onClick={openLogin} className="gap-1.5">
                <LogIn className="size-4" aria-hidden="true" />
                Sign In
              </Button>
            }
          />
        ) : (
          <Tabs defaultValue="profile">
            <TabsList>
              <TabsTrigger value="profile" className="gap-1.5">
                <UserRound className="size-3.5" aria-hidden="true" />
                Profile
              </TabsTrigger>
              <TabsTrigger value="password" className="gap-1.5">
                <KeyRound className="size-3.5" aria-hidden="true" />
                Password
              </TabsTrigger>
              <TabsTrigger value="addresses" className="gap-1.5">
                <MapPin className="size-3.5" aria-hidden="true" />
                Addresses
              </TabsTrigger>
            </TabsList>

            <TabsContent value="profile">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Personal Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <ProfileTab />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="password">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Change Password</CardTitle>
                </CardHeader>
                <CardContent>
                  <PasswordTab />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="addresses">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Saved Addresses</CardTitle>
                </CardHeader>
                <CardContent>
                  <AddressesTab />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </main>
  );
}
