import Link from "next/link";
import { SearchX } from "lucide-react";

/**
 * Global 404 for routes outside the store group (the storefront ships its
 * own richer (store)/not-found.tsx). Kept server-rendered and indexed as a
 * normal page.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <SearchX className="size-7" />
      </div>
      <h1 className="mt-4 font-heading text-2xl font-bold sm:text-3xl">
        Page not found
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or has moved.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/"
          className="rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Back to the store
        </Link>
        <Link
          href="/search"
          className="rounded-full border px-6 py-2.5 text-sm font-semibold hover:bg-card"
        >
          Search products
        </Link>
      </div>
    </div>
  );
}
