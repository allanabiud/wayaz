"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";

interface UseQueryResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refetch: () => void;
}

interface UseQueryOptions<T> {
  initialData?: T | null;
}

export function useQuery<T>(
  fetcher: () => Promise<T>,
  deps: ReadonlyArray<unknown> = [],
  options?: UseQueryOptions<T>,
): UseQueryResult<T> {
  const [nonce, setNonce] = useState(0);
  const key = JSON.stringify([...deps, nonce]);

  const [result, setResult] = useState<{
    key: string | null;
    data: T | null;
    error: string | null;
  }>({
    key: options?.initialData ? key : null,
    data: options?.initialData ?? null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    fetcher()
      .then((data) => {
        if (!cancelled) setResult({ key, data, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setResult((prev) => ({
          key,
          // Preserve existing / initial data so the UI stays usable
          // while showing a non-blocking error indicator.
          data: prev.data,
          error: err instanceof ApiError ? err.message : "Something went wrong",
        }));
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  const settled = result.key === key;

  return {
    data: result.data,
    error: settled ? result.error : null,
    loading: !settled,
    refetch,
  };
}
