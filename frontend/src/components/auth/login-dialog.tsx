"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { ApiError, login, tokenStore } from "@/lib/api";
import type { SessionUser } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (user: SessionUser) => void;
  title?: string;
  description?: string;
}

export function LoginDialog({
  open,
  onOpenChange,
  onSuccess,
  title = "Sign In",
  description = "Enter your username or email and password to access your account.",
}: Props) {
  const { signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    setError(null);
    setSubmitting(true);
    try {
      const result = await login(username.trim(), password);
      tokenStore.save({ access: result.access, refresh: result.refresh });
      signIn(result.user);

      const isStaffOrAdmin =
        result.user.role === "admin" ||
        result.user.role === "staff" ||
        result.user.is_staff ||
        result.user.is_superuser;

      if (isStaffOrAdmin) {
        toast.success(`Signed in as ${result.user.role || "staff"}.`, {
          description: "Admin privileges enabled.",
        });
      } else {
        toast.success(`Welcome back, ${result.user.display_name || result.user.username}!`);
      }

      onOpenChange(false);
      setUsername("");
      setPassword("");
      onSuccess?.(result.user);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 401
            ? "Incorrect username or password."
            : err.message
          : "Could not reach the server. Is the backend running?",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/waynz_logo.jpg"
            alt="Wayaz Collection"
            className="mx-auto h-10 w-auto mb-2"
          />
          <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {description}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1.5 text-left">
            <Label htmlFor="dialog-username" className="text-xs">Username or email</Label>
            <Input
              id="dialog-username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={submitting}
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5 text-left">
            <Label htmlFor="dialog-password" className="text-xs">Password</Label>
            <div className="relative">
              <Input
                id="dialog-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                className="h-9 pr-10 text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-0 right-0 h-full px-2.5 hover:bg-transparent"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="size-4 text-muted-foreground" />
                ) : (
                  <Eye className="size-4 text-muted-foreground" />
                )}
              </Button>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive text-center"
            >
              {error}
            </div>
          )}

          <Button
            type="submit"
            className="w-full h-9 font-medium"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Signing in…
              </>
            ) : (
              "Sign In"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
