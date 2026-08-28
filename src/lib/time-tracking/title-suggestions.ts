import { normalizeText } from "@/lib/search/match";
import { TITLE_MIN_QUERY } from "@/lib/ui/list-thresholds";

export interface TitleSeed {
  title: string;
  projectId: string | null;
  categoryId: string | null;
  tags: string[];
  /** ISO timestamp used to pick the most recent seed within a group. */
  at: string;
}

export interface TitleSuggestion {
  title: string;
  count: number;
  projectId: string | null;
  categoryId: string | null;
  tags: string[];
}

interface TitleGroup {
  title: string;
  count: number;
  mostRecent: TitleSeed;
  tagCounts: Map<string, number>;
}

export type TitleIndex = Map<string, TitleGroup>;

const FUZZY_CANDIDATE_CAP = 200;
const FUZZY_LENGTH_BAND = 0.4;
const FUZZY_JACCARD_THRESHOLD = 0.6;
const FUZZY_LEVENSHTEIN_SIMILARITY_THRESHOLD = 0.82;

function groupToSuggestion(group: TitleGroup): TitleSuggestion {
  const tags = Array.from(group.tagCounts.entries())
    .filter(([, count]) => count / group.count >= 0.5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag);

  return {
    title: group.mostRecent.title,
    count: group.count,
    projectId: group.mostRecent.projectId,
    categoryId: group.mostRecent.categoryId,
    tags,
  };
}

/**
 * Groups seeds by normalized title. Project/category come from the most
 * recent seed in each group — recency beats majority, since people move
 * projects. Tags need majority presence (>=50%) to survive.
 */
export function buildTitleIndex(seeds: TitleSeed[]): TitleIndex {
  const index: TitleIndex = new Map();

  for (const seed of seeds) {
    const key = normalizeText(seed.title);
    if (!key) {
      continue;
    }

    const existing = index.get(key);
    if (!existing) {
      const tagCounts = new Map(seed.tags.map((tag) => [tag, 1]));
      index.set(key, { title: seed.title, count: 1, mostRecent: seed, tagCounts });
      continue;
    }

    existing.count += 1;
    for (const tag of seed.tags) {
      existing.tagCounts.set(tag, (existing.tagCounts.get(tag) ?? 0) + 1);
    }
    if (Date.parse(seed.at) > Date.parse(existing.mostRecent.at)) {
      existing.mostRecent = seed;
      existing.title = seed.title;
    }
  }

  return index;
}

function tokenize(value: string): Set<string> {
  return new Set(normalizeText(value).split(/\s+/).filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) {
    return 1;
  }
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) {
      intersection++;
    }
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  return dp[rows - 1][cols - 1];
}

function levenshteinSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) {
    return 1;
  }
  return 1 - levenshtein(a, b) / maxLen;
}

function hasAnyAssignment(suggestion: TitleSuggestion): boolean {
  return Boolean(suggestion.projectId || suggestion.categoryId || suggestion.tags.length > 0);
}

/**
 * Finds the best suggestion for a title being typed, cascading from exact
 * match down to fuzzy. Returns `null` early rather than fuzzy-matching a
 * winner that would carry nothing worth applying.
 */
export function findTitleSuggestion(index: TitleIndex, rawTitle: string): TitleSuggestion | null {
  const query = normalizeText(rawTitle);
  if (query.length < TITLE_MIN_QUERY) {
    return null;
  }

  const exact = index.get(query);
  if (exact) {
    const suggestion = groupToSuggestion(exact);
    return hasAnyAssignment(suggestion) ? suggestion : null;
  }

  if (query.length >= 4) {
    let best: TitleGroup | null = null;
    for (const [key, group] of index) {
      if (!key.startsWith(query)) {
        continue;
      }
      if (
        !best ||
        group.count > best.count ||
        (group.count === best.count && Date.parse(group.mostRecent.at) > Date.parse(best.mostRecent.at))
      ) {
        best = group;
      }
    }
    if (best) {
      const suggestion = groupToSuggestion(best);
      return hasAnyAssignment(suggestion) ? suggestion : null;
    }
  }

  const queryTokens = tokenize(query);
  const minLen = query.length * (1 - FUZZY_LENGTH_BAND);
  const maxLen = query.length * (1 + FUZZY_LENGTH_BAND);

  let candidatesSeen = 0;
  let best: { group: TitleGroup; score: number } | null = null;

  for (const [key, group] of index) {
    if (key.length < minLen || key.length > maxLen) {
      continue;
    }
    if (candidatesSeen >= FUZZY_CANDIDATE_CAP) {
      break;
    }
    candidatesSeen++;

    const jaccardScore = jaccard(queryTokens, tokenize(key));
    const similarity = levenshteinSimilarity(query, key);
    const matches = jaccardScore >= FUZZY_JACCARD_THRESHOLD || similarity >= FUZZY_LEVENSHTEIN_SIMILARITY_THRESHOLD;
    if (!matches) {
      continue;
    }

    const score = Math.max(jaccardScore, similarity);
    if (!best || score > best.score) {
      best = { group, score };
    }
  }

  if (!best) {
    return null;
  }

  const suggestion = groupToSuggestion(best.group);
  return hasAnyAssignment(suggestion) ? suggestion : null;
}
