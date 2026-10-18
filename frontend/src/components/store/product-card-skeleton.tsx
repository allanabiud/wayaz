import { Skeleton } from "@/components/ui/skeleton";

interface ProductCardSkeletonProps {
  count?: number;
}

export function ProductCardSkeleton() {
  return (
    <article
      aria-hidden="true"
      className="flex flex-col overflow-hidden rounded-2xl border bg-card shadow-(--shadow-card)"
    >
      <Skeleton className="aspect-[3/4] w-full rounded-none" />
      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/3" />
        </div>
        <div className="mt-auto flex flex-col gap-2 pt-2 xl:flex-row">
          <Skeleton className="h-9 w-full rounded-md xl:min-w-0 xl:flex-1" />
          <Skeleton className="h-9 w-full rounded-md xl:min-w-0 xl:flex-1" />
        </div>
      </div>
    </article>
  );
}

export function ProductGridSkeleton({ count = 8 }: ProductCardSkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 md:grid-cols-4"
    >
      {Array.from({ length: count }).map((_, index) => (
        <ProductCardSkeleton key={index} />
      ))}
    </div>
  );
}
