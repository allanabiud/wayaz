"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Eye, EyeOff, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
    <div className="grid min-h-screen place-items-center bg-muted/40 px-4 py-8">
      <div className="w-full max-w-sm space-y-4">
        <Card className="w-full">
          <CardHeader className="text-center pb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/waynz_logo.jpg"
              alt="Wayaz Collection"
              className="mx-auto h-10 w-auto mb-2"
            />
            <h1 className="text-xl font-bold tracking-tight">Sign In</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Sign in to manage your orders or access staff dashboard
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {isStaffRequested && (
              <div
                role="status"
                className="flex items-start gap-2.5 rounded-lg border border-primary/20 bg-primary/10 p-2.5 text-xs text-primary"
              >
                <ShieldAlert className="size-4 shrink-0 mt-0.5" />
                <span>
                  Staff credentials required to access the requested backoffice page.
                </span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="username" className="text-xs">Username or email</Label>
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
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    className="pr-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={submitting}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute top-0 right-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" aria-hidden />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" aria-hidden />
                    )}
                  </Button>
                </div>
              </div>

              {error && (
                <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive text-center">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full font-medium" disabled={submitting}>
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
          </CardContent>
        </Card>

        <div className="text-center">
          <Button variant="ghost" size="sm" asChild className="text-xs text-muted-foreground hover:text-foreground">
            <Link href="/">
              <ArrowLeft className="mr-1.5 size-3.5" />
              Return to Storefront
            </Link>
          </Button>
        </div>
      </div>
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
