import { Skeleton } from "@/components/ui/skeleton";

export default function AuthLoading() {
  return (
    <main
      className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10"
      aria-hidden="true"
    >
      <Skeleton className="mx-auto h-8 w-40" />
      <div className="mt-8 space-y-4 rounded-2xl border bg-card p-6">
        <div className="space-y-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-10 w-full" />
        </div>
        <Skeleton className="h-10 w-full" />
      </div>
    </main>
  );
}
