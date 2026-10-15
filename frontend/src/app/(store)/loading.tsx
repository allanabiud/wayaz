import { Skeleton } from "@/components/ui/skeleton";

// Generic storefront fallback: banner block + a product grid, matching the
// homepage shape. Route-level files (product, search, category) take
// precedence for their own segments.
export default function StoreLoading() {
  return (
    <main aria-hidden="true">
      <section className="border-b bg-muted/30">
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
            <div className="min-w-0 space-y-3 lg:flex-1">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-9 w-72 max-w-full" />
              <Skeleton className="h-4 w-96 max-w-full" />
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Skeleton className="h-9 w-28 lg:h-14 lg:w-32" />
              <Skeleton className="h-9 w-28 lg:h-14 lg:w-32" />
            </div>
          </div>
        </div>
      </section>
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <Skeleton className="h-5 w-40" />
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="overflow-hidden rounded-2xl border">
              <Skeleton className="aspect-[3/4] w-full rounded-none" />
              <div className="space-y-2 p-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
