"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
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
import { ApiError, login, registerCustomer, tokenStore } from "@/lib/api";
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
}: Props) {
  const { signIn } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");

  // Login state
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Register state
  const [regFullName, setRegFullName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    setError(null);
    setSubmitting(true);
    try {
      const result = await login(username.trim(), password);
      tokenStore.save({ access: result.access, refresh: result.refresh });
      signIn(result.user);

      // Plain welcome for everyone; staff find the dashboard via the
      // Admin Dashboard item in the account menu.
      toast.success(
        `Welcome back, ${result.user.display_name || result.user.username}!`,
      );

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

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    setError(null);
    setSubmitting(true);

    const nameParts = regFullName.trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";
    const chosenUsername =
      regUsername.trim() || regEmail.trim().split("@")[0] || "user";

    try {
      await registerCustomer({
        username: chosenUsername,
        email: regEmail.trim(),
        password: regPassword,
        first_name: firstName,
        last_name: lastName,
        phone_number: regPhone.trim(),
      });

      // Auto login right after registration
      const result = await login(chosenUsername, regPassword);
      tokenStore.save({ access: result.access, refresh: result.refresh });
      signIn(result.user);

      toast.success(`Account created! Welcome, ${result.user.display_name || result.user.username}.`);
      onOpenChange(false);
      setRegFullName("");
      setRegEmail("");
      setRegPhone("");
      setRegUsername("");
      setRegPassword("");
      onSuccess?.(result.user);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not create account. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/wayaz_logo.jpeg"
            alt="Wayaz Collection"
            className="mx-auto h-10 w-auto mb-2"
          />
          <DialogTitle className="text-xl font-bold">
            {mode === "login" ? "Sign In" : "Create Account"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {mode === "login"
              ? "Access your saved addresses, past orders, and wishlist."
              : "Register to save your shipping details and enjoy faster checkout."}
          </DialogDescription>
        </DialogHeader>

        {mode === "login" ? (
          <form onSubmit={handleLogin} className="space-y-4 pt-1">
            <div className="space-y-1.5 text-left">
              <Label htmlFor="dialog-username" className="text-xs">
                Username or email
              </Label>
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
              <Label htmlFor="dialog-password" className="text-xs">
                Password
              </Label>
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

            <div className="flex justify-end">
              <button
                type="button"
                className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                onClick={() => {
                  // Close first - the reset flow is a full page, not a
                  // step inside this dialog.
                  onOpenChange(false);
                  router.push("/forgot-password");
                }}
              >
                Forgot password?
              </button>
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

            <div className="text-center text-xs text-muted-foreground pt-1">
              Don&apos;t have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMode("register");
                }}
                className="text-primary font-semibold hover:underline cursor-pointer"
              >
                Create one now
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-3 pt-1">
            <div className="space-y-1.5 text-left">
              <Label htmlFor="reg-fullname" className="text-xs">
                Full Name
              </Label>
              <Input
                id="reg-fullname"
                required
                value={regFullName}
                onChange={(e) => setRegFullName(e.target.value)}
                placeholder="Jane Doe"
                disabled={submitting}
                className="h-9 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 text-left">
              <div className="space-y-1.5">
                <Label htmlFor="reg-email" className="text-xs">
                  Email Address
                </Label>
                <Input
                  id="reg-email"
                  type="email"
                  required
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="jane@example.com"
                  disabled={submitting}
                  className="h-9 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reg-phone" className="text-xs">
                  Phone Number
                </Label>
                <Input
                  id="reg-phone"
                  type="tel"
                  required
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                  placeholder="0712345678"
                  disabled={submitting}
                  className="h-9 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-left">
              <div className="space-y-1.5">
                <Label htmlFor="reg-username" className="text-xs">
                  Username (optional)
                </Label>
                <Input
                  id="reg-username"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  placeholder="janedoe"
                  disabled={submitting}
                  className="h-9 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reg-password" className="text-xs">
                  Password
                </Label>
                <Input
                  id="reg-password"
                  type="password"
                  required
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  disabled={submitting}
                  className="h-9 text-sm"
                />
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
                  Creating account…
                </>
              ) : (
                "Create Account"
              )}
            </Button>

            <div className="text-center text-xs text-muted-foreground pt-1">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMode("login");
                }}
                className="text-primary font-semibold hover:underline cursor-pointer"
              >
                Sign in
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
