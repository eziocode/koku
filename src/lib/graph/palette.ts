/**
 * Graph colour system.
 *
 * The knowledge and logger graphs colour nodes by *group* (cluster, tag, or
 * category) the way Obsidian's graph view does: every group gets its own hue so
 * clusters are readable at a glance. Hues here are more saturated than the
 * muted chart palette in `@/lib/charts/theme` because graph nodes are small
 * dots on a flat canvas and need to separate without a legend.
 */

/** Distinct hues, ordered so adjacent groups never share a neighbouring hue. */
export const GRAPH_PALETTE = [
  "#e0603f", // terracotta
  "#3f8fd0", // azure
  "#4bab6a", // green
  "#c9993a", // amber
  "#8a6ede", // violet
  "#e0699e", // pink
  "#2fa8a0", // teal
  "#d4743a", // orange
  "#6f8fd8", // periwinkle
  "#9bab3a", // olive
  "#c15fc9", // magenta
  "#3fb0c9", // cyan
  "#d05f5f", // rose
  "#7a8a9c", // slate
] as const;

/** Colour used for nodes that belong to no group (no tags, no links). */
export const GRAPH_NEUTRAL = "#8b8178";

function hashKey(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Palette colour for a numeric group index (wraps around the palette). */
export function getGraphColorByIndex(index: number): string {
  return GRAPH_PALETTE[Math.abs(index) % GRAPH_PALETTE.length];
}

/** Stable palette colour for an arbitrary key (tag name, category id, …). */
export function getGraphColorByKey(key: string): string {
  return GRAPH_PALETTE[hashKey(key) % GRAPH_PALETTE.length];
}

function clampChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function parseHex(color: string) {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!match) {
    return null;
  }

  const hex = match[1].length === 3
    ? match[1].split("").map((char) => char + char).join("")
    : match[1];

  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

/** `rgba()` string for a hex colour — Sigma needs literal colours, not CSS vars. */
export function withAlpha(color: string, alpha: number): string {
  const rgb = parseHex(color);
  if (!rgb) {
    return color;
  }
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
}

/**
 * Blends a colour toward white (dark theme) or black (light theme) to produce
 * the dimmed variant used when a hovered node fades everything unrelated.
 */
export function fadeColor(color: string, amount: number, isDark: boolean): string {
  const rgb = parseHex(color);
  if (!rgb) {
    return color;
  }

  const target = isDark ? 24 : 232;
  return `rgb(${clampChannel(rgb.r + (target - rgb.r) * amount)},${clampChannel(
    rgb.g + (target - rgb.g) * amount,
  )},${clampChannel(rgb.b + (target - rgb.b) * amount)})`;
}

export interface CommunityEdge {
  source: string;
  target: string;
}

/**
 * Deterministic label-propagation community detection.
 *
 * Obsidian colours graph groups by connected structure; label propagation gives
 * the same effect (dense link neighbourhoods share a colour) while staying
 * cheap enough to run on every render and, unlike the usual randomised
 * variants, produces identical output for identical input so node colours never
 * flicker between renders.
 */
export function detectCommunities(
  nodeIds: string[],
  edges: CommunityEdge[],
  passes = 10,
): Map<string, number> {
  const adjacency = new Map<string, Set<string>>();
  const ordered = [...nodeIds].sort();
  ordered.forEach((id) => adjacency.set(id, new Set()));

  edges.forEach((edge) => {
    if (edge.source === edge.target) {
      return;
    }
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  });

  const labels = new Map<string, string>();
  ordered.forEach((id) => labels.set(id, id));

  for (let pass = 0; pass < passes; pass += 1) {
    let changed = false;

    for (const id of ordered) {
      const neighbours = adjacency.get(id);
      if (!neighbours || neighbours.size === 0) {
        continue;
      }

      const counts = new Map<string, number>();
      neighbours.forEach((neighbour) => {
        const label = labels.get(neighbour);
        if (label) {
          counts.set(label, (counts.get(label) ?? 0) + 1);
        }
      });

      let best = labels.get(id) ?? id;
      let bestCount = counts.get(best) ?? 0;
      // Sorted iteration + `<` tie-break keeps the winner deterministic.
      Array.from(counts.entries())
        .sort((left, right) => left[0].localeCompare(right[0]))
        .forEach(([label, count]) => {
          if (count > bestCount || (count === bestCount && label < best)) {
            best = label;
            bestCount = count;
          }
        });

      if (best !== labels.get(id)) {
        labels.set(id, best);
        changed = true;
      }
    }

    if (!changed) {
      break;
    }
  }

  // Rank communities by size (largest first) so the most prominent cluster
  // always gets palette slot 0 and colours stay stable as the graph grows.
  const sizes = new Map<string, number>();
  labels.forEach((label) => sizes.set(label, (sizes.get(label) ?? 0) + 1));

  const rank = new Map<string, number>();
  Array.from(sizes.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .forEach(([label], index) => rank.set(label, index));

  const result = new Map<string, number>();
  ordered.forEach((id) => {
    const label = labels.get(id);
    result.set(id, label ? rank.get(label) ?? 0 : 0);
  });

  return result;
}
