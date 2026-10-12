"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Eye, EyeOff, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { ApiError, login, tokenStore } from "@/lib/api";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const { ready, isAuthenticated, canManage, signIn } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!ready || !isAuthenticated) return;
    if (next) {
      router.replace(next);
    } else if (canManage) {
      router.replace("/admin");
    } else {
      router.replace("/");
    }
  }, [ready, isAuthenticated, canManage, next, router]);

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
        toast.success(`Signed in as ${result.user.role || "staff"}.`);
        router.replace(next || "/admin");
      } else {
        toast.success(`Welcome back, ${result.user.display_name || result.user.username}!`);
        router.replace(next || "/");
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 401
            ? "Incorrect username or password."
            : err.message
          : "Could not reach the server. Is the backend running?",
      );
      setSubmitting(false);
    }
  };

  const isStaffRequested = Boolean(next && next.startsWith("/admin"));

  return (
    <div className="flex min-h-screen w-full flex-col justify-between bg-background p-6 sm:p-10">
      {/* Top Bar with Return link */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* subtle header branding */}
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Wayaz Admin
          </span>
        </div>

        <Button
          variant="ghost"
          size="sm"
          asChild
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          <Link href="/">
            <ArrowLeft className="mr-1.5 size-3.5" />
            Return to Storefront
          </Link>
        </Button>
      </header>

      {/* Main Centered Authentication Form */}
      <main className="my-auto mx-auto w-full max-w-sm space-y-6">
        {/* Larger Brand Logo and Header */}
        <div className="flex flex-col items-center text-center space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/waynz_logo.jpg"
            alt="Wayaz Collection"
            className="h-16 w-auto rounded-2xl shadow-md border border-border/60 object-contain"
          />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Sign In
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Enter your credentials to access your account.
            </p>
          </div>
        </div>

        {isStaffRequested && (
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-xl border border-primary/20 bg-primary/10 p-3 text-xs text-primary"
          >
            <ShieldAlert className="size-4 shrink-0 mt-0.5" />
            <span>
              Staff credentials required to access the admin portal.
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="username" className="text-xs font-medium">
              Username or Email
            </Label>
            <Input
              id="username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={submitting}
              placeholder="admin or name@example.com"
              className="h-10 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs font-medium">
              Password
            </Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                className="h-10 pr-10 text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                placeholder="••••••••"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-0 right-0 h-full px-3 text-muted-foreground hover:text-foreground hover:bg-transparent"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden />
                )}
              </Button>
            </div>
          </div>

          <div className="flex justify-end">
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Forgot password?
            </Link>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive text-center"
            >
              {error}
            </p>
          )}

          <Button
            type="submit"
            className="h-10 w-full text-sm font-semibold cursor-pointer"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Signing in…
              </>
            ) : (
              "Sign In"
            )}
          </Button>
        </form>
      </main>

      {/* Footer */}
      <footer className="flex flex-col sm:flex-row items-center justify-between text-xs text-muted-foreground gap-2 pt-6">
        <span>&copy; {new Date().getFullYear()} Wayaz Collection · Nairobi, Kenya</span>
        <span>Protected by Wayaz Session Authentication</span>
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-muted/40" />}>
      <LoginForm />
    </Suspense>
  );
}
