/** Pure text matching shared by combobox, tag input, and manager search. */

export function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

/** Higher is better; `null` means "does not match". */
export function matchRank(query: string, text: string): number | null {
  const q = normalizeText(query);
  const t = normalizeText(text);
  if (q.length === 0) {
    return 0;
  }

  if (t === q) {
    return 4;
  }
  if (t.startsWith(q)) {
    return 3;
  }
  if (t.split(/\s+/).some((word) => word.startsWith(q))) {
    return 2;
  }
  if (t.includes(q)) {
    return 1;
  }

  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++;
    }
  }
  return qi === q.length ? 0.5 : null;
}

/**
 * Empty query returns `items` by identity so a `useMemo` keyed on the result
 * stays cheap when there is nothing to filter.
 */
export function filterByQuery<T>(
  items: T[],
  query: string,
  getText: (item: T) => string,
  extraKeywords?: (item: T) => string[] | undefined,
): T[] {
  const q = normalizeText(query);
  if (q.length === 0) {
    return items;
  }

  const ranked: Array<{ item: T; rank: number }> = [];
  for (const item of items) {
    const primary = matchRank(q, getText(item));
    const keywordRanks = (extraKeywords?.(item) ?? []).map((keyword) => matchRank(q, keyword));
    const best = [primary, ...keywordRanks].filter((rank): rank is number => rank !== null);
    if (best.length > 0) {
      ranked.push({ item, rank: Math.max(...best) });
    }
  }

  ranked.sort((a, b) => b.rank - a.rank);
  return ranked.map((r) => r.item);
}
