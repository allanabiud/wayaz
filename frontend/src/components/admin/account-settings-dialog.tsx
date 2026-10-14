"use client";

import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, login, tokenStore } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface AccountSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AccountSettingsDialog({ open, onOpenChange }: AccountSettingsDialogProps) {
  const { user, signIn } = useAuth();
  const [tab, setTab] = useState<"profile" | "security">("profile");

  const [profileName, setProfileName] = useState(user?.display_name || "");
  const [profilePhone, setProfilePhone] = useState(user?.phone_number || "");
  const [profileEmail, setProfileEmail] = useState(user?.email || "");
  const [savingProfile, setSavingProfile] = useState(false);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName.trim()) {
      toast.error("Name is required");
      return;
    }
    setSavingProfile(true);
    try {
      const parts = profileName.trim().split(/\s+/);
      const firstName = parts[0] || "";
      const lastName = parts.slice(1).join(" ") || "";
      await api.patch("/api/v1/auth/me/", {
        first_name: firstName,
        last_name: lastName,
        phone_number: profilePhone.trim() || null,
        email: profileEmail.trim(),
      });
      if (user) {
        signIn({
          ...user,
          display_name: profileName.trim(),
          email: profileEmail.trim(),
          phone_number: profilePhone.trim(),
        });
      }
      toast.success("Profile updated successfully!");
      onOpenChange(false);
    } catch {
      toast.error("Failed to update profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword || !newPassword) {
      toast.error("Please fill in both current and new password.");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }
    setSavingPassword(true);
    try {
      await api.post("/api/v1/auth/change-password/", {
        old_password: oldPassword,
        new_password: newPassword,
      });
      // The password change retires the tokens this session holds; re-mint
      // them so the person who changed the password isn't logged out.
      if (user) {
        const session = await login(user.username, newPassword);
        tokenStore.save({
          access: session.access,
          refresh: session.refresh,
        });
      }
      toast.success("Password changed successfully!");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onOpenChange(false);
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Failed to update password. Check your current password.";
      toast.error(message);
    } finally {
      setSavingPassword(false);
    }
  };

  const tabClass = (active: boolean) =>
    `flex items-center gap-1.5 pb-2 pt-1 font-medium border-b-2 transition-colors cursor-pointer mr-4 ${
      active
        ? "border-primary text-primary"
        : "border-transparent text-muted-foreground hover:text-foreground"
    }`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Account Settings</DialogTitle>
          <DialogDescription>
            Manage your account profile and security credentials.
          </DialogDescription>
        </DialogHeader>

        <div className="flex border-b border-border/60 text-xs">
          <button type="button" onClick={() => setTab("profile")} className={tabClass(tab === "profile")}>
            <User className="size-3.5" />
            Profile Details
          </button>
          <button type="button" onClick={() => setTab("security")} className={tabClass(tab === "security")}>
            <KeyRound className="size-3.5" />
            Password & Security
          </button>
        </div>

        {tab === "profile" ? (
          <form onSubmit={handleSaveProfile} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="profile-name">Display Name</Label>
              <Input
                id="profile-name"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="e.g. John Doe"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-email">Email Address</Label>
              <Input
                id="profile-email"
                type="email"
                value={profileEmail}
                onChange={(e) => setProfileEmail(e.target.value)}
                placeholder="name@example.com"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-phone">Phone Number</Label>
              <Input
                id="profile-phone"
                value={profilePhone}
                onChange={(e) => setProfilePhone(e.target.value)}
                placeholder="e.g. 0712345678"
              />
            </div>
            <DialogFooter className="mt-4 gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={savingProfile}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={savingProfile}>
                {savingProfile ? "Saving…" : "Save Profile"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <form onSubmit={handleSavePassword} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="old-password">Current Password</Label>
              <Input
                id="old-password"
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 8 characters"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <DialogFooter className="mt-4 gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={savingPassword}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={savingPassword}>
                {savingPassword ? "Updating…" : "Update Password"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
