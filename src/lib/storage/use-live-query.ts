"use client";

import { liveQuery } from "dexie";
import { useEffect, useMemo, useState } from "react";

import { auditLogger } from "@/lib/audit/logger";

function serializeDeps(deps: readonly unknown[]) {
  return JSON.stringify(deps, (_key, value) => {
    if (value instanceof Date) {
      return value.toISOString();
    }

    if (value instanceof Set) {
      return Array.from(value);
    }

    return value;
  });
}

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
  const depsKey = useMemo(() => serializeDeps(deps), [deps]);

  useEffect(() => {
    const subscription = liveQuery(querier).subscribe({
      next: (value) => setResult(value),
      error: (error) => auditLogger.event("storage.live-query.error", "runtime", {
        error: error instanceof Error ? error.name : "UnknownError",
      }),
    });

    return () => subscription.unsubscribe();
    // The hook API intentionally mirrors React deps: callers pass every value
    // that the querier closes over, and depsKey represents that list stably.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey]);

  return result;
}
