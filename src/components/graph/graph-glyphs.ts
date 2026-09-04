/**
 * Line-art glyph library for the graph canvas.
 *
 * Every glyph is authored once, at module load, as a `Path2D` in a unit box
 * centred on the origin and spanning roughly -1..1. The canvas draws one by
 * translating to the node, scaling by its screen radius and stroking the path,
 * so the per-frame cost is a transform plus a stroke no matter how intricate
 * the artwork is.
 *
 * Two rules keep the set reading as one sheet of icons rather than a pile of
 * drawings:
 *
 * 1. Stroke weight is uniform in *screen* pixels. Because the path is stroked
 *    under a `scale(r, r)`, callers must set `lineWidth = weight / r` — see
 *    `glyphLineWidth`. A glyph that skips this gets a hairline when small and a
 *    slab when large, which is exactly the tell of a scaled bitmap.
 * 2. Glyphs never fill. Colour arrives as the stroke; the ground shows through.
 */

import type { CanvasNodeKind } from "./graph-canvas";

/** Every glyph the canvas can draw, grouped by the kind that owns it. */
export type GlyphId =
  // `hub` — surface detail stroked inside the lit sphere.
  | "planet-banded"
  | "planet-swirl"
  | "planet-cratered"
  // `group` — stroke-only bodies, no sphere underneath.
  | "orbit-system"
  | "satellite"
  | "dish"
  // `tag` — stroke-only sparks.
  | "sparkle"
  | "starburst"
  | "cross-spark"
  | "constellation"
  // `leaf` — surface detail plus, for the travelling ones, a trail.
  | "moon-crater"
  | "comet"
  | "meteor";

/**
 * Variant pools. Kind stays the primary read — every glyph in a family carries
 * the same silhouette mass — and the variant is texture on top of it.
 */
export const GLYPHS_BY_KIND: Record<CanvasNodeKind, GlyphId[]> = {
  hub: ["planet-banded", "planet-swirl", "planet-cratered"],
  group: ["orbit-system", "satellite", "dish"],
  // `cross-spark` is deliberately absent: it is the shape a tag falls back to
  // when it is too small for artwork, and at full size a bare ✕ reads as a
  // close button rather than as a star.
  tag: ["sparkle", "starburst", "constellation"],
  leaf: ["moon-crater", "comet", "meteor"],
};

/**
 * FNV-1a over the node id. Any cheap avalanche would do; what matters is that
 * it is a pure function of the id, so a node keeps its glyph across relayouts,
 * refilters and remounts. A glyph that changed on every render would read as a
 * bug even if every individual frame looked right.
 */
function hashId(id: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Picks this node's glyph from its kind's pool. Stable for a given id. */
export function pickGlyph(kind: CanvasNodeKind, id: string): GlyphId {
  const pool = GLYPHS_BY_KIND[kind];
  return pool[hashId(id) % pool.length];
}

/**
 * Stroke width to set *after* scaling by the node radius, so the drawn line
 * lands at `weight` screen pixels. Clamped at the thin end because a sub-pixel
 * stroke antialiases into a grey smear rather than a line.
 */
export function glyphLineWidth(weight: number, radius: number): number {
  return Math.max(weight, 0.75) / Math.max(radius, 0.001);
}

// ── Path builders ───────────────────────────────────────────────────────────
// Each returns a unit-space Path2D. Built once, below, into GLYPH_PATHS.

/** Horizontal bands across a sphere, drawn as ellipse arcs that foreshorten. */
function bandedPlanet(): Path2D {
  const path = new Path2D();
  // Chords at three heights; the half-width of a circle's chord at height y is
  // sqrt(1 - y²), which is what makes the bands hug the silhouette.
  [-0.45, 0, 0.42].forEach((y) => {
    const half = Math.sqrt(Math.max(0, 1 - y * y));
    path.moveTo(-half, y);
    // A shallow bow gives each band the curvature of a sphere's latitude line.
    path.quadraticCurveTo(0, y + 0.16, half, y);
  });
  return path;
}

/** Two off-centre arcs that read as a gas giant's storm swirl. */
function swirlPlanet(): Path2D {
  const path = new Path2D();
  // Three sweeping currents rather than two, and carried nearer the rim, so the
  // storm still reads once the overlay alpha knocks it back.
  path.moveTo(-0.95, -0.34);
  path.bezierCurveTo(-0.3, -0.72, 0.4, -0.5, 0.92, -0.06);
  path.moveTo(-0.92, 0.16);
  path.bezierCurveTo(-0.35, -0.1, 0.25, 0.02, 0.88, 0.3);
  path.moveTo(-0.72, 0.56);
  path.bezierCurveTo(-0.25, 0.34, 0.25, 0.44, 0.6, 0.7);
  // The eye of the storm.
  path.ellipse(0.24, -0.2, 0.26, 0.16, -0.35, 0, Math.PI * 2);
  return path;
}

/** A sparse crater field. Circles only — anything busier turns to noise. */
function crateredPlanet(): Path2D {
  const path = new Path2D();
  ([
    [-0.34, -0.3, 0.26],
    [0.3, 0.12, 0.2],
    [-0.1, 0.5, 0.14],
  ] as const).forEach(([x, y, r]) => {
    path.moveTo(x + r, y);
    path.arc(x, y, r, 0, Math.PI * 2);
  });
  return path;
}

/** Two craters, sparser than a planet's — a moon is the quieter body. */
function craterMoon(): Path2D {
  const path = new Path2D();
  ([
    [-0.28, -0.22, 0.24],
    [0.26, 0.3, 0.17],
  ] as const).forEach(([x, y, r]) => {
    path.moveTo(x + r, y);
    path.arc(x, y, r, 0, Math.PI * 2);
  });
  return path;
}

/**
 * A core with two tilted orbits around it. The orbits run wider than the unit
 * box on purpose: this is the widest glyph in the set, and the caller shrinks
 * the body to compensate.
 */
function orbitSystem(): Path2D {
  const path = new Path2D();
  path.moveTo(0.34, 0);
  path.arc(0, 0, 0.34, 0, Math.PI * 2);
  path.ellipse(0, 0, 1, 0.36, -0.36, 0, Math.PI * 2);
  path.ellipse(0, 0, 0.72, 0.26, 0.62, 0, Math.PI * 2);
  return path;
}

/**
 * Body, two panelled wings, a dish on top.
 *
 * The wings stand off the body on visible booms and are shorter than it is
 * tall. Butting the panels straight onto a same-height body turns the whole
 * glyph into an undifferentiated row of boxes, which is the failure mode this
 * shape is one silhouette away from.
 */
function satellite(): Path2D {
  const path = new Path2D();
  // Body: taller than wide, so it holds its own against the panels.
  path.rect(-0.2, -0.42, 0.4, 0.84);
  path.moveTo(-0.2, -0.1);
  path.lineTo(0.2, -0.1);
  path.moveTo(-0.2, 0.16);
  path.lineTo(0.2, 0.16);

  ([-1, 1] as const).forEach((side) => {
    // Boom: the gap is what separates wing from body at a glance.
    path.moveTo(side * 0.2, 0);
    path.lineTo(side * 0.38, 0);
    // Panel, split into two cells.
    const near = side * 0.38;
    const far = side * 0.95;
    path.rect(Math.min(near, far), -0.24, Math.abs(far - near), 0.48);
    path.moveTo((near + far) / 2, -0.24);
    path.lineTo((near + far) / 2, 0.24);
  });

  // Comms dish, offset so the glyph is not perfectly symmetrical.
  path.moveTo(0.06, -0.42);
  path.lineTo(0.06, -0.62);
  path.ellipse(0.06, -0.7, 0.18, 0.1, 0, Math.PI, Math.PI * 2);
  return path;
}

/**
 * Radio dish: a bowl on a mast over a plinth.
 *
 * The bowl is a closed shape — a deep arc capped by the ellipse of its own rim
 * — rather than a bare arc with a stick through it. An open arc plus a mast is
 * what reads as a pair of scissors; giving the bowl a rim gives it a mouth, and
 * the mouth is the whole icon.
 */
function dish(): Path2D {
  const path = new Path2D();
  const tilt = -0.42;
  const cx = 0;
  const cy = -0.3;
  const rx = 0.68;
  const ry = 0.3;

  // Bowl: the far side of the rim ellipse, closed by the dish's depth.
  path.ellipse(cx, cy, rx, ry, tilt, 0, Math.PI * 2);
  // Depth line across the bowl, so it is a cup and not a coin.
  path.ellipse(cx, cy, rx * 0.55, ry * 0.55, tilt, 0, Math.PI * 2);

  // Feed arm out of the bowl's mouth, angled with the tilt.
  path.moveTo(cx, cy);
  path.lineTo(cx + Math.sin(-tilt) * 0.52, cy - Math.cos(tilt) * 0.52);

  // Mast down to a plinth.
  path.moveTo(cx - 0.06, cy + ry * 0.7);
  path.lineTo(cx - 0.06, 0.52);
  path.moveTo(-0.36, 0.52);
  path.lineTo(0.3, 0.52);
  return path;
}

/**
 * Four-point sparkle: the tips sit on the axes and every edge between them
 * curves *inward*, because each quadratic's control point is the origin. That
 * inward pull is the whole difference between a twinkle and a diamond — and
 * between this and the filled, outward-bowed petals it replaces, which read as
 * a flower.
 */
function sparkle(): Path2D {
  const path = new Path2D();
  const tips: [number, number][] = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];
  path.moveTo(tips[0][0], tips[0][1]);
  for (let index = 1; index <= tips.length; index += 1) {
    const [x, y] = tips[index % tips.length];
    path.quadraticCurveTo(0, 0, x, y);
  }
  path.closePath();
  return path;
}

/** The sparkle again, with four short diagonal rays catching between the arms. */
function starburst(): Path2D {
  const path = new Path2D();
  path.addPath(sparkle());
  for (let ray = 0; ray < 4; ray += 1) {
    const angle = Math.PI / 4 + (Math.PI / 2) * ray;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    path.moveTo(dx * 0.34, dy * 0.34);
    path.lineTo(dx * 0.78, dy * 0.78);
  }
  return path;
}

/** A plain ✕ of four rays. The shape a tag collapses to when it is tiny. */
function crossSpark(): Path2D {
  const path = new Path2D();
  const diagonal = Math.SQRT1_2;
  ([
    [diagonal, diagonal],
    [diagonal, -diagonal],
  ] as const).forEach(([x, y]) => {
    path.moveTo(-x, -y);
    path.lineTo(x, y);
  });
  return path;
}

/** Three stars joined by two hairlines, like the constellation on the sheet. */
function constellation(): Path2D {
  const path = new Path2D();
  const stars: [number, number][] = [
    [-0.78, 0.3],
    [-0.05, -0.5],
    [0.76, 0.14],
  ];
  path.moveTo(stars[0][0], stars[0][1]);
  stars.slice(1).forEach(([x, y]) => path.lineTo(x, y));
  stars.forEach(([x, y]) => {
    path.moveTo(x + 0.15, y);
    path.arc(x, y, 0.15, 0, Math.PI * 2);
  });
  return path;
}

/**
 * Trails for the travelling leaves. These are drawn *outside* the body clip,
 * unlike the crater overlays, so they are kept in their own map and the unit
 * box here is the body's, not the trail's — the trail runs off to the left and
 * the caller rotates it away from the graph centre.
 */
function cometTrail(): Path2D {
  const path = new Path2D();
  ([
    [-0.05, 0.0, -2.4],
    [-0.55, 0.12, -1.85],
    [-0.5, -0.14, -1.75],
  ] as const).forEach(([y, drop, reach]) => {
    path.moveTo(-1.05, y);
    path.quadraticCurveTo((reach - 1.05) / 2, y + drop, reach, y + drop * 1.6);
  });
  return path;
}

function meteorTrail(): Path2D {
  const path = new Path2D();
  path.moveTo(-1.05, 0);
  path.lineTo(-2.5, -0.28);
  return path;
}

/**
 * Body-space glyphs: stroked inside or in place of the node body.
 *
 * Held as builders rather than as finished paths because `Path2D` is a browser
 * global. Next renders these components on the server first, and a module that
 * constructs one at import time throws `Path2D is not defined` before any
 * canvas exists to draw into. Building on first use keeps the cost paid once
 * while confining it to the client.
 */
const GLYPH_BUILDERS: Record<GlyphId, () => Path2D> = {
  "planet-banded": bandedPlanet,
  "planet-swirl": swirlPlanet,
  "planet-cratered": crateredPlanet,
  "orbit-system": orbitSystem,
  satellite,
  dish,
  sparkle,
  starburst,
  "cross-spark": crossSpark,
  constellation,
  "moon-crater": craterMoon,
  // Travelling leaves reuse the moon's craters for their body detail.
  comet: craterMoon,
  meteor: craterMoon,
};

/** Trail artwork, drawn outside the body clip and only for the two that have one. */
const TRAIL_BUILDERS: Partial<Record<GlyphId, () => Path2D>> = {
  comet: cometTrail,
  meteor: meteorTrail,
};

const glyphCache = new Map<GlyphId, Path2D>();
const trailCache = new Map<GlyphId, Path2D>();

/** The unit-space path for a glyph, built on first use and reused after. */
export function getGlyphPath(glyph: GlyphId): Path2D {
  const cached = glyphCache.get(glyph);
  if (cached) return cached;
  const built = GLYPH_BUILDERS[glyph]();
  glyphCache.set(glyph, built);
  return built;
}

/** The trail behind a travelling body, or `null` for the ones that do not move. */
export function getGlyphTrail(glyph: GlyphId): Path2D | null {
  const cached = trailCache.get(glyph);
  if (cached) return cached;
  const builder = TRAIL_BUILDERS[glyph];
  if (!builder) return null;
  const built = builder();
  trailCache.set(glyph, built);
  return built;
}

/**
 * How much to shrink a `group` body so its widest glyph still fits the radius
 * the layout budgeted for it. `orbit-system` reaches a full unit horizontally
 * where the sphere it replaces only reached its own rim.
 */
export const GROUP_GLYPH_SCALE: Record<string, number> = {
  "orbit-system": 0.92,
  satellite: 0.95,
  dish: 1,
};

/**
 * Deterministic heading for a node's trail, so comets and meteors do not all
 * streak the same way. Derived from the same hash as the glyph choice, which
 * keeps a node's whole appearance a pure function of its id.
 */
export function glyphAngle(id: string): number {
  return (hashId(id) % 360) * (Math.PI / 180);
}
