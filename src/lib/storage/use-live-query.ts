"use client";

import { liveQuery } from "dexie";
import { useEffect, useState } from "react";

export function useLiveQuery<T>(
  querier: () => Promise<T> | T,
  deps?: readonly unknown[],
): T | undefined;
export function useLiveQuery<T>(
  querier: () => Promise<T> | T,
  deps: readonly unknown[] | undefined,
  defaultResult: T,
): T;
export function useLiveQuery<T>(
  querier: () => Promise<T> | T,
  deps: readonly unknown[] = [],
  defaultResult?: T,
) {
  const [result, setResult] = useState<T | undefined>(defaultResult);

  useEffect(() => {
    const subscription = liveQuery(querier).subscribe({
      next: (value) => setResult(value),
      error: (error) => console.error(error),
    });

    return () => subscription.unsubscribe();
  }, deps);

  return result;
}
