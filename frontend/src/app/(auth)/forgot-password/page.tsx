"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { forgotPassword } from "@/lib/store";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const target = email.trim();
    if (!target) return;

    setError(null);
    setSubmitting(true);
    try {
      await forgotPassword(target);
      setSentTo(target);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not reach the server. Is the backend running?",
      );
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
            {sentTo ? "Check Your Inbox" : "Forgot Your Password?"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {sentTo
              ? "If that email has an account, a reset link is on its way."
              : "Enter your email and we'll send you a link to set a new password."}
          </p>
        </div>

        {sentTo ? (
          <div className="space-y-4 rounded-xl border border-border/60 bg-card p-4 text-center">
            <MailCheck
              className="mx-auto size-8 text-emerald-600 dark:text-emerald-400"
              aria-hidden
            />
            <p className="text-sm leading-relaxed text-muted-foreground">
              We sent a link to{" "}
              <span className="font-medium text-foreground">{sentTo}</span>. It
              expires after a few days. Don&rsquo;t see it? Check your spam
              folder.
            </p>
            <div className="flex flex-col gap-2">
              <Button asChild className="h-10 w-full text-sm font-semibold">
                <Link href="/login">Back to Sign In</Link>
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-9 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setSentTo(null);
                  setEmail("");
                }}
              >
                Use a different email
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-medium">
                Email
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="h-10 text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                placeholder="name@example.com"
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
              {submitting ? "Sending…" : "Send Reset Link"}
            </Button>
          </form>
        )}
      </main>

      <footer className="text-center text-xs text-muted-foreground">
        Remembered it?{" "}
        <Link
          href="/login"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </footer>
    </div>
  );
}
