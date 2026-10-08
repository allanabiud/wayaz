"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";

interface UseQueryResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refetch: () => void;
}

export function useQuery<T>(
  fetcher: () => Promise<T>,
  deps: ReadonlyArray<unknown> = [],
): UseQueryResult<T> {
  const [nonce, setNonce] = useState(0);
  const key = JSON.stringify([...deps, nonce]);

  const [result, setResult] = useState<{
    key: string | null;
    data: T | null;
    error: string | null;
  }>({ key: null, data: null, error: null });

  useEffect(() => {
    let cancelled = false;

    fetcher()
      .then((data) => {
        if (!cancelled) setResult({ key, data, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setResult({
          key,
          data: null,
          error: err instanceof ApiError ? err.message : "Something went wrong",
        });
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
