import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function StoreNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col items-center px-4 py-24 text-center sm:px-6">
      <p className="text-xs font-semibold tracking-[0.25em] text-gold uppercase">
        404
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        Product not found
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        This piece may have been removed, or the link is broken.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <Link href="/">Back to the store</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/contact">Contact Support</Link>
        </Button>
      </div>
    </div>
  );
}
