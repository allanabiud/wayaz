"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Route-segment error boundary: catches runtime crashes in any page below
 * the root layout so shoppers see a branded recovery screen instead of a
 * white Next.js error page. `retry` re-renders the failed segment.
 */
export default function RouteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-7" />
      </div>
      <h1 className="mt-4 font-heading text-2xl font-bold sm:text-3xl">
        Something went wrong
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        An unexpected error occurred while loading this page. Your cart is
        safe - please try again, or head back to the store.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button onClick={retry} className="bg-emerald-600 hover:bg-emerald-700">
          Try again
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">Back to the store</Link>
        </Button>
      </div>
    </div>
  );
}
