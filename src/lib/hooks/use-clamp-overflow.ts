"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * Whether the ref'd element is currently clipping its content — e.g. behind a
 * `line-clamp-*` class — so a "Show more" toggle can be shown only when there
 * is actually more to show, instead of guessing from raw text length.
 *
 * Must be measured while the clamping class is applied: an unclamped element
 * never overflows, so this can't tell "fits in 3 lines" from "would fit if we
 * removed the clamp". Re-measures on resize and whenever `deps` change (e.g.
 * the text itself, or a "show full" toggle that removes the clamp).
 */
export function useClampOverflow(deps: unknown[]) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      setOverflowing(false);
      return;
    }

    const measure = () => {
      setOverflowing(element.scrollHeight > element.clientHeight + 1);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `deps` is the caller-supplied re-measure trigger.
  }, deps);

  return { ref, overflowing };
}
