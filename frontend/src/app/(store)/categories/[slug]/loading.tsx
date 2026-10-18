import { Skeleton } from "@/components/ui/skeleton";
import { ProductGridSkeleton } from "@/components/store/product-card-skeleton";

export default function CategoryLoading() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <Skeleton className="h-4 w-32" />
      <div className="mt-4 flex items-center justify-between gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="mt-6">
        <ProductGridSkeleton count={8} />
      </div>
    </main>
  );
}
