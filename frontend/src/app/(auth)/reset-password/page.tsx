"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, Link2Off } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { resetPassword } from "@/lib/store";

/** True when the 400 came from the link itself (dead or tampered), as
 * opposed to a field problem like a too-weak password. */
function isLinkProblem(err: ApiError): boolean {
  return (
    typeof err.detail === "object" &&
    err.detail !== null &&
    "detail" in (err.detail as Record<string, unknown>)
  );
}

function ResetPasswordContent() {
  // The mail link lands here with the token in the query string.
  const searchParams = useSearchParams();
  const uidb64 = searchParams.get("uidb64");
  const token = searchParams.get("token");
  const linkUsable = Boolean(uidb64 && token);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || !uidb64 || !token) return;
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await resetPassword(uidb64, token, password);
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          isLinkProblem(err)
            ? "This reset link is not valid or has expired. Request a fresh one below."
            : err.message,
        );
      } else {
        setError("Could not reach the server. Is the backend running?");
      }
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col justify-between bg-background p-6 sm:p-10">
      <header>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/login">
            <ArrowLeft className="mr-1.5 size-3.5" />
            Back to Sign In
          </Link>
        </Button>
      </header>

      <main className="my-auto mx-auto w-full max-w-sm space-y-6">
        <div className="space-y-1.5 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {done ? "Password Updated" : "Choose a New Password"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {done
              ? "Your new password is ready - sign in with it."
              : "Pick something you haven't used on Wayaz before."}
          </p>
        </div>

        {!linkUsable ? (
          <div className="space-y-4 rounded-xl border border-border/60 bg-card p-4 text-center">
            <Link2Off
              className="mx-auto size-8 text-muted-foreground"
              aria-hidden
            />
            <p className="text-sm leading-relaxed text-muted-foreground">
              This reset link looks incomplete - it may have been cut off in
              transit. Request a fresh one and use the new link in full.
            </p>
            <Button asChild className="h-10 w-full text-sm font-semibold">
              <Link href="/forgot-password">Request a New Link</Link>
            </Button>
          </div>
        ) : done ? (
          <div className="space-y-4 rounded-xl border border-border/60 bg-card p-4 text-center">
            <CheckCircle2
              className="mx-auto size-8 text-emerald-600 dark:text-emerald-400"
              aria-hidden
            />
            <p className="text-sm leading-relaxed text-muted-foreground">
              Anyone holding an older session has been signed out, so this
              account is yours alone again.
            </p>
            <Button asChild className="h-10 w-full text-sm font-semibold">
              <Link href="/login">Sign In</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-password" className="text-xs font-medium">
                New Password
              </Label>
              <Input
                id="new-password"
                name="new-password"
                type="password"
                autoComplete="new-password"
                required
                className="h-10 text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                placeholder="At least 8 characters"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-password" className="text-xs font-medium">
                Confirm Password
              </Label>
              <Input
                id="confirm-password"
                name="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                className="h-10 text-sm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={submitting}
                placeholder="Type it once more"
              />
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-xs font-medium text-destructive"
              >
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="h-10 w-full text-sm font-semibold"
              disabled={submitting}
            >
              {submitting ? "Saving…" : "Set New Password"}
            </Button>
          </form>
        )}
      </main>

      <footer className="text-center text-xs text-muted-foreground">
        Need another link?{" "}
        <Link
          href="/forgot-password"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Request a new one
        </Link>
      </footer>
    </div>
  );
}

export default function ResetPasswordPage() {
  // useSearchParams needs a Suspense boundary to keep the page prerenderable.
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background text-xs text-muted-foreground">
          Loading…
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
