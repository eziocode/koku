"use client";

import Graph from "graphology";
import circular from "graphology-layout/circular";
import forceAtlas2 from "graphology-layout-forceatlas2";
import { Maximize2, Pause, Play, Pin, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { darkenColor, lightenColor, withAlpha } from "@/lib/graph/palette";
import { cn } from "@/lib/utils";

/** Visual family of a node. Shape encodes kind so colour can encode grouping. */
export type CanvasNodeKind = "hub" | "group" | "tag" | "leaf";

export interface CanvasNode {
  id: string;
  label: string;
  color: string;
  size: number;
  /** Drawn shape. Defaults to `hub` (a filled sphere). */
  kind?: CanvasNodeKind;
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  /** Relative thickness, 0–1. Falls back to a hairline. */
  weight?: number;
}

/** Physics knobs exposed to the caller's settings panel. */
export interface GraphForces {
  /** Pull toward the centre — higher packs the graph tighter. */
  gravity: number;
  /** Node-to-node repulsion — higher spreads clusters apart. */
  scalingRatio: number;
  /** Damping. Higher settles slower but overshoots less. */
  slowDown: number;
  /** Weight given to edges when pulling linked nodes together. */
  edgeWeightInfluence: number;
}

export const DEFAULT_FORCES: GraphForces = {
  gravity: 0.6,
  scalingRatio: 12,
  slowDown: 6,
  edgeWeightInfluence: 1,
};

interface GraphCanvasProps {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  isDark: boolean;
  /** Nodes matching an active search/filter stay lit; everything else fades. */
  highlightIds?: Set<string> | null;
  onNodeClick?: (id: string) => void;
  onNodeHover?: (id: string | null) => void;
  forces?: GraphForces;
  className?: string;
}

interface Camera {
  /** World coordinate sitting at the centre of the viewport. */
  x: number;
  y: number;
  /** World-to-screen pixel scale. */
  zoom: number;
}

interface Placed {
  id: string;
  /** Screen-space centre. */
  sx: number;
  sy: number;
  /** Screen-space radius. */
  r: number;
  node: CanvasNode;
  /** 0 = fully lit, 1 = fully faded. Animated. */
  fade: number;
}

/**
 * Frame size the authored node sizes are tuned for (px, shorter edge), plus the
 * band the viewport scale is allowed to move within. Below the reference the
 * bodies shrink so a small card still reads as a map rather than a pile.
 */
const REFERENCE_EDGE = 620;
const MIN_VIEWPORT_SCALE = 0.5;
const MAX_VIEWPORT_SCALE = 1.15;

/** Fit padding, itself scaled down on small frames by `PADDING_RATIO`. */
const PADDING = 34;
/** Padding never eats more than this share of the shorter edge. */
const PADDING_RATIO = 0.07;
const MIN_ZOOM_FACTOR = 0.25;
const MAX_ZOOM_FACTOR = 8;
/** Per-frame easing for fade/framing transitions — snappy but not jumpy. */
const EASE = 0.16;

/**
 * Canvas chrome. The graph paints into a 2D context that cannot read CSS
 * variables, so the theme is mirrored by hand here.
 */
function chrome(dark: boolean) {
  return {
    label: dark ? "#dbe3ec" : "#243044",
    labelMuted: dark ? "rgba(219,227,236,.72)" : "rgba(36,48,68,.66)",
    labelHalo: dark ? "rgba(6,10,18,.85)" : "rgba(255,255,255,.9)",
    pillFill: dark ? "rgba(13,19,30,.92)" : "rgba(255,255,255,.95)",
    pillStroke: dark ? "rgba(148,163,184,.28)" : "rgba(100,116,139,.22)",
    pillText: dark ? "#f4f7fb" : "#0f172a",
    edgeBase: dark ? "#aebdcf" : "#59677d",
    ringMix: dark ? 0.38 : 0.22,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

const LABEL_FONT =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';

/**
 * Graph renderer shared by both graph tabs.
 *
 * Colour comes from the caller (one colour per group); this component owns the
 * look and the interaction model. It renders with Canvas 2D rather than a WebGL
 * graph library because the aesthetic — curved edges that gradient between the
 * two nodes they join, nodes drawn as lit spheres with a soft bloom, shapes that
 * distinguish node kinds, and haloed labels instead of boxed ones — needs
 * per-primitive drawing control that a point-sprite renderer does not give.
 *
 * Layout is a live ForceAtlas2 simulation stepped on the animation frame, so the
 * graph settles visibly and can be dragged around like Obsidian's graph view.
 * Nodes are pinned where you drop them; the pin control releases them all.
 *
 * Framing is automatic while the simulation expands the graph — the camera eases
 * to keep everything in frame — and hands control over permanently as soon as
 * you pan or zoom (the fit control takes it back).
 */
export function GraphCanvas({
  nodes,
  edges,
  isDark,
  highlightIds,
  onNodeClick,
  onNodeHover,
  forces = DEFAULT_FORCES,
  className,
}: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const graphRef = useRef<Graph>(new Graph());
  const frameRef = useRef<number | null>(null);

  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const cameraRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  /** Zoom the last auto-fit chose — node radii are relative to it. */
  const fitZoomRef = useRef(1);
  const autoFitRef = useRef(true);

  const nodesRef = useRef<CanvasNode[]>(nodes);
  const edgesRef = useRef<CanvasEdge[]>(edges);
  const fadeRef = useRef(new Map<string, number>());
  const placedRef = useRef<Placed[]>([]);

  const hoveredRef = useRef<string | null>(null);
  const draggedRef = useRef<string | null>(null);
  const highlightRef = useRef<Set<string> | null>(highlightIds ?? null);
  const isDarkRef = useRef(isDark);
  const runningRef = useRef(true);
  const forcesRef = useRef(forces);
  const callbacksRef = useRef({ onNodeClick, onNodeHover });

  const [running, setRunning] = useState(true);
  const [hasPins, setHasPins] = useState(false);

  useEffect(() => {
    callbacksRef.current = { onNodeClick, onNodeHover };
  }, [onNodeClick, onNodeHover]);

  useEffect(() => {
    highlightRef.current = highlightIds ?? null;
  }, [highlightIds]);

  useEffect(() => {
    isDarkRef.current = isDark;
  }, [isDark]);

  useEffect(() => {
    forcesRef.current = forces;
  }, [forces]);

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  // ── Camera helpers ────────────────────────────────────────────────────────
  const worldBounds = useCallback(() => {
    const graph = graphRef.current;
    if (graph.order === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    graph.forEachNode((_id, attr) => {
      minX = Math.min(minX, attr.x as number);
      maxX = Math.max(maxX, attr.x as number);
      minY = Math.min(minY, attr.y as number);
      maxY = Math.max(maxY, attr.y as number);
    });
    return { minX, minY, maxX, maxY };
  }, []);

  /** Eases (or snaps) the camera so the whole graph sits inside the viewport. */
  const fitCamera = useCallback(
    (immediate = false) => {
      const bounds = worldBounds();
      const { width, height } = sizeRef.current;
      if (!bounds || width === 0 || height === 0) return;

      const spanX = Math.max(bounds.maxX - bounds.minX, 1e-3);
      const spanY = Math.max(bounds.maxY - bounds.minY, 1e-3);
      // A fixed 34px gutter is a third of a phone-width card, so cap it as a
      // share of the frame too.
      const padding = Math.min(PADDING, Math.min(width, height) * PADDING_RATIO);
      const zoom = Math.min(
        (width - padding * 2) / spanX,
        (height - padding * 2) / spanY,
      );
      const target: Camera = {
        x: (bounds.minX + bounds.maxX) / 2,
        y: (bounds.minY + bounds.maxY) / 2,
        zoom: clamp(zoom, 1e-4, 4000),
      };

      const camera = cameraRef.current;
      if (immediate) {
        camera.x = target.x;
        camera.y = target.y;
        camera.zoom = target.zoom;
      } else {
        camera.x += (target.x - camera.x) * EASE;
        camera.y += (target.y - camera.y) * EASE;
        camera.zoom += (target.zoom - camera.zoom) * EASE;
      }
      fitZoomRef.current = target.zoom;
    },
    [worldBounds],
  );

  // ── Data sync ─────────────────────────────────────────────────────────────
  // The graph is mutated in place: filters must dim nodes, never re-seed the
  // layout, and `nodes`/`edges` are fresh array identities on every render.
  useEffect(() => {
    const graph = graphRef.current;
    nodesRef.current = nodes;
    edgesRef.current = edges;

    const nextNodeIds = new Set(nodes.map((node) => node.id));
    graph.forEachNode((id) => {
      if (!nextNodeIds.has(id)) graph.dropNode(id);
    });

    let added = 0;
    nodes.forEach((node) => {
      if (graph.hasNode(node.id)) return;
      graph.addNode(node.id, { x: 0, y: 0 });
      added += 1;
    });

    const nextEdgeIds = new Set<string>();
    edges.forEach((edge) => {
      if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) return;
      const existing = graph.edge(edge.source, edge.target);
      if (existing) {
        nextEdgeIds.add(existing);
        graph.setEdgeAttribute(existing, "weight", 0.2 + (edge.weight ?? 0));
        return;
      }
      graph.addEdgeWithKey(edge.id, edge.source, edge.target, {
        weight: 0.2 + (edge.weight ?? 0),
      });
      nextEdgeIds.add(edge.id);
    });

    graph.forEachEdge((id) => {
      if (!nextEdgeIds.has(id)) graph.dropEdge(id);
    });

    // Seed only a genuinely new graph — re-seeding on every filter change is
    // what makes a canvas jump around under the pointer.
    if (added > 0 && added === graph.order && graph.order > 0) {
      // Seeded at a real-world scale so the fit zoom lands near 1× — ForceAtlas2
      // itself is scale-free and would otherwise settle inside a unit circle.
      circular.assign(graph, { scale: 140 });
      if (graph.size > 0) {
        forceAtlas2.assign(graph, {
          iterations: graph.order > 400 ? 60 : 120,
          settings: { ...forceAtlas2.inferSettings(graph), ...forcesRef.current },
        });
      }
      autoFitRef.current = true;
      fitCamera(true);
    }

    const fades = fadeRef.current;
    fades.forEach((_value, id) => {
      if (!nextNodeIds.has(id)) fades.delete(id);
    });

    setHasPins(graph.someNode((_id, attr) => attr.fixed === true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  // ── Draw ──────────────────────────────────────────────────────────────────
  const draw = useCallback((time: number) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const graph = graphRef.current;
    const { width, height, dpr } = sizeRef.current;
    const dark = isDarkRef.current;
    const theme = chrome(dark);
    const camera = cameraRef.current;
    const hovered = hoveredRef.current;
    const highlight = highlightRef.current;
    const nodeById = new Map(nodesRef.current.map((node) => [node.id, node]));

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    const toScreen = (wx: number, wy: number) => ({
      sx: (wx - camera.x) * camera.zoom + width / 2,
      sy: (wy - camera.y) * camera.zoom + height / 2,
    });

    drawStarfield(context, width, height, camera, dark, time);

    // Node radii track the authored size at fit zoom and grow as you zoom in,
    // but only sub-linearly so a deep zoom does not turn nodes into blobs.
    //
    // The authored sizes assume a roomy frame, so they are also scaled by how
    // much frame there actually is: on a phone-width card or a short embedded
    // panel the same planets would swamp the canvas and collide with every
    // label. Scale tracks the smaller edge, since that is what runs out first.
    const viewportScale = clamp(
      Math.min(width, height) / REFERENCE_EDGE,
      MIN_VIEWPORT_SCALE,
      MAX_VIEWPORT_SCALE,
    );
    const radiusScale =
      clamp(camera.zoom / (fitZoomRef.current || 1), 0.62, 2.4) * viewportScale;

    // ── Resolve placement + fade for every node ─────────────────────────────
    const fades = fadeRef.current;
    const placed: Placed[] = [];
    graph.forEachNode((id, attr) => {
      const node = nodeById.get(id);
      if (!node) return;

      const dimmedBySearch = highlight ? !highlight.has(id) : false;
      const dimmedByHover = hovered ? id !== hovered && !graph.areNeighbors(hovered, id) : false;
      const target = dimmedBySearch || dimmedByHover ? 1 : 0;
      const current = fades.get(id) ?? target;
      const fade = current + (target - current) * EASE;
      fades.set(id, Math.abs(target - fade) < 0.004 ? target : fade);

      const { sx, sy } = toScreen(attr.x as number, attr.y as number);
      placed.push({
        id,
        sx,
        sy,
        r: Math.max(2 * viewportScale, node.size * radiusScale),
        node,
        fade,
      });
    });

    const placedById = new Map(placed.map((item) => [item.id, item]));
    placedRef.current = placed;

    // ── Edges ───────────────────────────────────────────────────────────────
    // Drawn as gentle arcs that gradient from the source colour to the target
    // colour, so a link reads as a relationship between two coloured things
    // rather than as grey scaffolding.
    context.lineCap = "round";
    graph.forEachEdge((id, attr, source, target) => {
      const from = placedById.get(source);
      const to = placedById.get(target);
      if (!from || !to) return;

      const inHighlight = !highlight || (highlight.has(source) && highlight.has(target));
      const touchesHover = !hovered || source === hovered || target === hovered;
      const lit = inHighlight && touchesHover;
      const fade = Math.max(from.fade, to.fade);

      const weight = ((attr.weight as number) ?? 0.2) - 0.2;
      const base = 0.7 + weight * 2.3;
      const emphasis = hovered && touchesHover ? 1.5 : 1;
      const alpha = lit
        ? (hovered && touchesHover ? 0.85 : dark ? 0.42 : 0.4) * (1 - fade * 0.85)
        : dark
          ? 0.05
          : 0.045;

      const { cx, cy, ex, ey, sx, sy } = arcPath(from, to);
      const gradient = context.createLinearGradient(sx, sy, ex, ey);
      gradient.addColorStop(0, withAlpha(from.node.color, alpha));
      gradient.addColorStop(1, withAlpha(to.node.color, alpha));

      context.strokeStyle = lit ? gradient : withAlpha(theme.edgeBase, alpha);
      context.lineWidth = base * emphasis * clamp(radiusScale, 0.7, 1.8);
      context.beginPath();
      context.moveTo(sx, sy);
      context.quadraticCurveTo(cx, cy, ex, ey);
      context.stroke();
    });

    // ── Node bloom ──────────────────────────────────────────────────────────
    // Bodies are flat discs, so there is no bloom pass: a halo under every node
    // (and its light-mode counterpart, a cast shadow) was the single biggest
    // source of visual noise, and a graph of a hundred nodes read as fog. Only
    // the hovered node gets a whisper of a halo, as a focus cue rather than
    // decoration.
    const focusedId = hovered ?? draggedRef.current;
    if (focusedId) {
      const item = placed.find((candidate) => candidate.id === focusedId);
      if (item && item.fade <= 0.35) {
        const spread = item.r * 2.1;
        const glow = context.createRadialGradient(
          item.sx,
          item.sy,
          item.r * 0.9,
          item.sx,
          item.sy,
          spread,
        );
        glow.addColorStop(0, withAlpha(item.node.color, dark ? 0.2 : 0.12));
        glow.addColorStop(1, withAlpha(item.node.color, 0));
        context.fillStyle = glow;
        context.beginPath();
        context.arc(item.sx, item.sy, spread, 0, Math.PI * 2);
        context.fill();
      }
    }

    // ── Nodes ───────────────────────────────────────────────────────────────
    // Largest first so small nodes land on top and stay clickable.
    [...placed]
      .sort((left, right) => right.r - left.r)
      .forEach((item) => {
        const focused = item.id === hovered || item.id === draggedRef.current;
        drawNode(context, item, { dark, focused, ringMix: theme.ringMix, time });
      });

    // ── Labels ──────────────────────────────────────────────────────────────
    // Haloed text, no boxes: boxes turn a graph into a table. Bigger nodes win
    // the space, and anything that would collide is dropped rather than
    // overlapped. Hovering promotes a node and its neighbours.
    const labelSize = clamp(11 * clamp(radiusScale, 0.85, 1.35), 9.5 * viewportScale, 15);
    context.font = `500 ${labelSize}px ${LABEL_FONT}`;
    context.textBaseline = "middle";
    const taken: Box[] = [];
    // Bodies count as obstacles too: a label crossing a planet is worse than no
    // label at all, so the text goes to the other side or is dropped.
    const bodies: Box[] = placed.map((item) => ({
      x: item.sx - item.r,
      y: item.sy - item.r,
      w: item.r * 2,
      h: item.r * 2,
    }));

    [...placed]
      .sort((left, right) => right.r - left.r)
      .forEach((item) => {
        if (item.fade > 0.45) return;
        const neighbourOfHover = hovered ? graph.areNeighbors(hovered, item.id) : false;
        const promoted = item.id === hovered || neighbourOfHover;
        if (!promoted && item.r < 6.5) return;
        if (item.id === hovered) return; // drawn last, as a pill

        const text = truncate(context, item.node.label, 168);
        const textWidth = context.measureText(text).width;
        const y = item.sy;

        // Right of the body first, then left; whichever side clears both the
        // other labels and the other bodies wins.
        const boxAt = (candidate: number): Box => ({
          x: candidate,
          y: y - labelSize / 2 - 2,
          w: textWidth,
          h: labelSize + 4,
        });
        const x = [item.sx + item.r + 8, item.sx - item.r - 8 - textWidth].find((candidate) => {
          if (candidate + textWidth < 0 || candidate > width) return false;
          const box = boxAt(candidate);
          if (taken.some((other) => overlaps(box, other))) return false;
          return !bodies.some((body) => overlaps(box, body));
        });
        if (x === undefined) return;
        taken.push(boxAt(x));

        const alpha = (promoted ? 1 : 0.78) * (1 - item.fade);
        context.save();
        context.globalAlpha = alpha;
        context.lineWidth = 3;
        context.strokeStyle = theme.labelHalo;
        context.strokeText(text, x, y);
        context.fillStyle = promoted ? theme.label : theme.labelMuted;
        context.fillText(text, x, y);
        context.restore();
      });

    // Hovered label sits in a pill so it stays readable over its own cluster.
    const hoveredPlaced = hovered ? placedById.get(hovered) : null;
    if (hoveredPlaced) {
      const text = truncate(context, hoveredPlaced.node.label, 240);
      const width = context.measureText(text).width;
      const padX = 9;
      const boxHeight = labelSize + 12;
      const x = hoveredPlaced.sx + hoveredPlaced.r + 8;
      const y = hoveredPlaced.sy - boxHeight / 2;

      context.save();
      context.fillStyle = theme.pillFill;
      context.strokeStyle = theme.pillStroke;
      context.lineWidth = 1;
      context.shadowColor = dark ? "rgba(0,0,0,.5)" : "rgba(15,23,42,.16)";
      context.shadowBlur = 12;
      context.shadowOffsetY = 2;
      context.beginPath();
      context.roundRect(x, y, width + padX * 2, boxHeight, boxHeight / 2);
      context.fill();
      context.shadowBlur = 0;
      context.shadowOffsetY = 0;
      context.stroke();
      // Colour chip ties the pill back to the node it describes.
      context.fillStyle = hoveredPlaced.node.color;
      context.beginPath();
      context.arc(x + padX - 1, y + boxHeight / 2, 3, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = theme.pillText;
      context.fillText(text, x + padX + 7, y + boxHeight / 2);
      context.restore();
    }
  }, []);

  // ── Animation loop: physics + paint ───────────────────────────────────────
  // ForceAtlas2 runs on the main thread rather than graphology's web worker:
  // the worker is built from a blob URL, which this app's CSP (`worker-src
  // 'self'`) blocks outright. A few iterations per frame is cheap at graph
  // scale and gives the same settling motion.
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      sizeRef.current = { width: rect.width, height: rect.height, dpr };
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    const tick = (time: number) => {
      const graph = graphRef.current;
      if (runningRef.current && graph.order > 0 && graph.size > 0) {
        const perFrame = graph.order > 300 ? 1 : graph.order > 80 ? 2 : 3;
        forceAtlas2.assign(graph, {
          iterations: perFrame,
          settings: { ...forceAtlas2.inferSettings(graph), ...forcesRef.current },
        });
      }
      if (autoFitRef.current) fitCamera();
      draw(time);
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      observer.disconnect();
    };
  }, [draw, fitCamera]);

  // ── Pointer interaction ───────────────────────────────────────────────────
  const pick = useCallback((clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let best: Placed | null = null;
    let bestDistance = Infinity;
    for (const item of placedRef.current) {
      const distance = Math.hypot(item.sx - x, item.sy - y);
      if (distance <= item.r + 5 && distance < bestDistance) {
        best = item;
        bestDistance = distance;
      }
    }
    return best;
  }, []);

  const screenToWorld = useCallback((clientX: number, clientY: number) => {
    const container = containerRef.current;
    const { width, height } = sizeRef.current;
    const camera = cameraRef.current;
    if (!container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    return {
      x: (clientX - rect.left - width / 2) / camera.zoom + camera.x,
      y: (clientY - rect.top - height / 2) / camera.zoom + camera.y,
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let panFrom: { x: number; y: number; camX: number; camY: number } | null = null;
    let moved = false;

    const handleDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const hit = pick(event.clientX, event.clientY);
      moved = false;
      container.setPointerCapture(event.pointerId);
      if (hit) {
        draggedRef.current = hit.id;
        autoFitRef.current = false;
      } else {
        panFrom = {
          x: event.clientX,
          y: event.clientY,
          camX: cameraRef.current.x,
          camY: cameraRef.current.y,
        };
      }
    };

    const handleMove = (event: PointerEvent) => {
      const dragged = draggedRef.current;
      if (dragged) {
        moved = true;
        const world = screenToWorld(event.clientX, event.clientY);
        const graph = graphRef.current;
        if (graph.hasNode(dragged)) {
          graph.mergeNodeAttributes(dragged, { x: world.x, y: world.y, fixed: true });
          setHasPins(true);
        }
        return;
      }

      if (panFrom) {
        const camera = cameraRef.current;
        const dx = (event.clientX - panFrom.x) / camera.zoom;
        const dy = (event.clientY - panFrom.y) / camera.zoom;
        if (Math.hypot(event.clientX - panFrom.x, event.clientY - panFrom.y) > 2) {
          moved = true;
          autoFitRef.current = false;
        }
        camera.x = panFrom.camX - dx;
        camera.y = panFrom.camY - dy;
        return;
      }

      const hit = pick(event.clientX, event.clientY);
      const id = hit ? hit.id : null;
      if (id !== hoveredRef.current) {
        hoveredRef.current = id;
        callbacksRef.current.onNodeHover?.(id);
        container.style.cursor = id ? "pointer" : "grab";
      }
    };

    const handleUp = (event: PointerEvent) => {
      if (container.hasPointerCapture(event.pointerId)) {
        container.releasePointerCapture(event.pointerId);
      }
      const dragged = draggedRef.current;
      // A tap that never moved is a click; a tap that moved repositioned a node.
      if (dragged && !moved) callbacksRef.current.onNodeClick?.(dragged);
      draggedRef.current = null;
      panFrom = null;
      moved = false;
    };

    const handleLeave = () => {
      if (hoveredRef.current !== null) {
        hoveredRef.current = null;
        callbacksRef.current.onNodeHover?.(null);
      }
    };

    // Zoom anchors on the pointer, so you zoom into what you are looking at.
    //
    // Only ⌘/ctrl + wheel zooms — which is exactly what a trackpad pinch sends,
    // so pinch-to-zoom works. A plain wheel is left to the page: the graph sits
    // inside a scrollable view, and swallowing the scroll there traps the reader
    // (it also means a stray wheel during scroll-restoration cannot silently
    // knock the camera off its automatic framing).
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const camera = cameraRef.current;
      const before = screenToWorld(event.clientX, event.clientY);
      const factor = Math.exp(-event.deltaY * 0.0022);
      const fit = fitZoomRef.current || 1;
      camera.zoom = clamp(camera.zoom * factor, fit * MIN_ZOOM_FACTOR, fit * MAX_ZOOM_FACTOR);
      const after = screenToWorld(event.clientX, event.clientY);
      camera.x += before.x - after.x;
      camera.y += before.y - after.y;
      autoFitRef.current = false;
    };

    container.style.cursor = "grab";
    container.addEventListener("pointerdown", handleDown);
    container.addEventListener("pointermove", handleMove);
    container.addEventListener("pointerup", handleUp);
    container.addEventListener("pointercancel", handleUp);
    container.addEventListener("pointerleave", handleLeave);
    container.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      container.removeEventListener("pointerdown", handleDown);
      container.removeEventListener("pointermove", handleMove);
      container.removeEventListener("pointerup", handleUp);
      container.removeEventListener("pointercancel", handleUp);
      container.removeEventListener("pointerleave", handleLeave);
      container.removeEventListener("wheel", handleWheel);
    };
  }, [pick, screenToWorld]);

  const zoom = useCallback(
    (direction: "in" | "out" | "reset") => {
      if (direction === "reset") {
        autoFitRef.current = true;
        fitCamera(true);
        return;
      }
      const camera = cameraRef.current;
      const fit = fitZoomRef.current || 1;
      const factor = direction === "in" ? 1.35 : 1 / 1.35;
      camera.zoom = clamp(camera.zoom * factor, fit * MIN_ZOOM_FACTOR, fit * MAX_ZOOM_FACTOR);
      autoFitRef.current = false;
    },
    [fitCamera],
  );

  const releasePins = useCallback(() => {
    const graph = graphRef.current;
    graph.forEachNode((id) => graph.removeNodeAttribute(id, "fixed"));
    setHasPins(false);
    setRunning(true);
  }, []);

  return (
    <div className={cn("relative", className)}>
      <div ref={containerRef} className="h-full w-full touch-none">
        <canvas ref={canvasRef} className="block h-full w-full" />
      </div>

      <div className="absolute bottom-4 left-4 flex flex-col overflow-hidden rounded-xl border border-border/70 bg-card/80 shadow-sm backdrop-blur">
        <button
          type="button"
          onClick={() => setRunning((value) => !value)}
          aria-label={running ? "Pause layout" : "Resume layout"}
          title={running ? "Pause layout" : "Resume layout"}
          className={cn(
            "p-2 transition-colors hover:bg-muted hover:text-foreground",
            running ? "text-primary" : "text-muted-foreground",
          )}
        >
          {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={releasePins}
          disabled={!hasPins}
          aria-label="Release pinned nodes"
          title={hasPins ? "Release pinned nodes" : "No pinned nodes"}
          className="border-t border-border/70 p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <Pin className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => zoom("in")}
          aria-label="Zoom in"
          className="border-t border-border/70 p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => zoom("out")}
          aria-label="Zoom out"
          className="border-t border-border/70 p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => zoom("reset")}
          aria-label="Fit graph to view"
          className="border-t border-border/70 p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * Deterministic pseudo-random in [0,1) for a star index.
 *
 * The starfield must be identical on every frame (and every render) or the sky
 * boils; a hash of the index gives that for free without storing anything.
 */
function starRandom(index: number, salt: number): number {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * Star count scales with canvas area — a fixed count that looks like a sky on a
 * wide canvas looks like static on a small one.
 */
function starCountFor(width: number, height: number): number {
  return Math.round(clamp((width * height) / 5600, 45, 150));
}

/**
 * Parallax starfield and nebula behind the graph.
 *
 * Stars drift with the camera at a fraction of its speed, so panning reads as
 * moving *through* space rather than sliding a texture, and each twinkles on its
 * own phase.
 *
 * Light mode keeps the metaphor but changes medium: a printed star chart rather
 * than the night sky. The void becomes a pale cool wash that lifts toward the
 * middle, the nebulae become watercolour tints, and the stars become ink specks
 * — bright-on-dark reversed to dark-on-light, since a glowing white star on
 * paper is invisible and a black one is a fly.
 */
function drawStarfield(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  camera: Camera,
  dark: boolean,
  time: number,
) {
  // Ground: the card behind the canvas is a flat shade either way, so the
  // backdrop is painted here — a vignetted void in the dark, a cool wash that
  // opens toward the middle in the light.
  const ground = context.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.12,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.78,
  );
  if (dark) {
    ground.addColorStop(0, "rgba(7,10,20,.35)");
    ground.addColorStop(1, "rgba(3,5,12,.78)");
  } else {
    ground.addColorStop(0, "rgba(255,255,255,.7)");
    ground.addColorStop(1, "rgba(203,213,228,.38)");
  }
  context.fillStyle = ground;
  context.fillRect(0, 0, width, height);

  // Two nebula clouds, parallaxed slower than the stars, give the backdrop some
  // depth and pick up the app's teal/violet accents. On paper the same clouds
  // are weaker still — a tint, not a glow.
  const cloudAlpha = dark ? 1 : 0.62;
  const clouds: { hue: string; fx: number; fy: number; scale: number; drift: number }[] = [
    { hue: "rgba(21,150,136,", fx: 0.28, fy: 0.32, scale: 0.85, drift: 0.06 },
    { hue: "rgba(138,110,222,", fx: 0.76, fy: 0.7, scale: 1.05, drift: 0.09 },
  ];
  clouds.forEach((cloud) => {
    const cx = width * cloud.fx - camera.x * camera.zoom * cloud.drift;
    const cy = height * cloud.fy - camera.y * camera.zoom * cloud.drift;
    const radius = Math.max(width, height) * 0.55 * cloud.scale;
    const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, `${cloud.hue}${(0.075 * cloudAlpha).toFixed(3)})`);
    gradient.addColorStop(0.55, `${cloud.hue}${(0.03 * cloudAlpha).toFixed(3)})`);
    gradient.addColorStop(1, `${cloud.hue}0)`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  });

  const parallaxX = camera.x * camera.zoom * 0.22;
  const parallaxY = camera.y * camera.zoom * 0.22;

  context.save();
  const count = starCountFor(width, height);
  for (let index = 0; index < count; index += 1) {
    const depth = 0.4 + starRandom(index, 3) * 0.9;
    const spanX = width + 120;
    const spanY = height + 120;
    const x = (((starRandom(index, 1) * spanX - parallaxX * depth) % spanX) + spanX) % spanX - 60;
    const y = (((starRandom(index, 2) * spanY - parallaxY * depth) % spanY) + spanY) % spanY - 60;

    // Ink on paper does not flicker the way a star does, so the light-mode
    // twinkle is damped to a slow breath.
    const swing = dark ? 0.45 : 0.18;
    const twinkle = 1 - swing + swing * Math.sin(time * 0.0011 * (0.5 + depth) + index);
    const radius = (0.5 + starRandom(index, 4) * 1.15) * (dark ? 1 : 0.85);
    const alpha = (dark ? 0.5 : 0.3) * twinkle * (0.45 + depth * 0.5);

    context.fillStyle = dark
      ? `rgba(226,236,248,${alpha.toFixed(3)})`
      : `rgba(51,65,88,${alpha.toFixed(3)})`;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

/**
 * Control point for an edge drawn as a gentle arc, plus endpoints trimmed back
 * to the rim of each body so lines meet the shapes instead of running under
 * them. Reads as an orbital path rather than a wire.
 */
function arcPath(from: Placed, to: Placed) {
  const dx = to.sx - from.sx;
  const dy = to.sy - from.sy;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;

  const sx = from.sx + ux * (from.r + 1.5);
  const sy = from.sy + uy * (from.r + 1.5);
  const ex = to.sx - ux * (to.r + 1.5);
  const ey = to.sy - uy * (to.r + 1.5);

  // Curvature is a fixed fraction of the span, and always bows the same way for
  // a given pair so the arc does not flip as the layout settles.
  const bow = length * 0.11;
  const cx = (sx + ex) / 2 + -uy * bow;
  const cy = (sy + ey) / 2 + ux * bow;

  return { sx, sy, ex, ey, cx, cy };
}

interface NodeStyle {
  dark: boolean;
  focused: boolean;
  ringMix: number;
  /** `performance.now()` — drives twinkle and the orbiting focus ring. */
  time: number;
}

/**
 * Paints one node as a celestial body. Kind picks the body; colour still comes
 * from the caller, so grouping survives the metaphor:
 *
 * Bodies are modelled, not flat: one scene light from the upper left gives each
 * a highlight, a terminator and a rim, and every body shades off the same axis
 * so they read as objects in one space. Shading fades out under a few pixels of
 * radius, where it would resolve to mud, leaving the old flat disc behind.
 *
 * - `hub` → planet: a lit sphere.
 * - `group` → the same sphere threaded through a tilted ring, its back half
 *   dimmed and drawn behind the body, its lit front half in front.
 * - `tag` → star: a faceted four-point gem.
 * - `leaf` → moon: a smaller sphere with shallower modelling.
 */
function drawNode(context: CanvasRenderingContext2D, item: Placed, style: NodeStyle) {
  const { dark, focused, ringMix, time } = style;
  const kind = item.node.kind ?? "hub";
  const radius = item.r * (focused ? 1.16 : 1);
  const alpha = 1 - item.fade * 0.82;

  context.save();
  context.globalAlpha = alpha;

  if (kind === "tag") {
    drawStar(context, item, radius, dark);
  } else if (kind === "leaf") {
    drawMoon(context, item, radius, dark);
  } else {
    if (kind === "group") drawPlanetRing(context, item, radius, "back", ringMix, dark);
    drawPlanet(context, item, radius, dark);
    if (kind === "group") drawPlanetRing(context, item, radius, "front", ringMix, dark);
  }

  // Focus marker: a dashed orbit that slowly rotates, so the hovered body reads
  // as selected without nudging the layout.
  if (focused) {
    context.save();
    context.translate(item.sx, item.sy);
    context.rotate((time * 0.00035) % (Math.PI * 2));
    context.setLineDash([3, 5]);
    context.lineWidth = 1.1;
    context.strokeStyle = dark
      ? withAlpha(lightenColor(item.node.color, 0.65), 0.7)
      : withAlpha(darkenColor(item.node.color, 0.35), 0.8);
    context.beginPath();
    context.arc(0, 0, radius + 7, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }

  context.restore();
}

/** Light comes from the upper left, so every body is lit from the same place. */
const LIGHT_X = -0.42;
const LIGHT_Y = -0.5;

/**
 * Shifts a colour along the light axis: positive lifts toward the highlight,
 * negative sinks toward the terminator. One helper so every body shades from
 * the same ramp and the palette colour stays recognisable at `0`.
 */
function shade(color: string, amount: number): string {
  if (amount === 0) return color;
  return amount > 0 ? lightenColor(color, amount) : darkenColor(color, -amount);
}

/**
 * Below this screen radius shading resolves to mud rather than to volume, so
 * tiny nodes stay flat and only pick the modelling back up as you zoom in.
 */
const SHADE_MIN_RADIUS = 3.4;

/** How strongly a body is modelled — ramps in over the first few pixels. */
function shadeStrength(radius: number): number {
  return clamp((radius - SHADE_MIN_RADIUS) / 5, 0, 1);
}

/**
 * Sphere: a lit body rather than a flat disc.
 *
 * Three passes stack into the illusion — an offset radial gradient for the
 * form (highlight, base colour at the palette's own value, terminator), a
 * crescent of rim light on the shadow side so the silhouette stays crisp
 * against the ground, and a small specular dot for the wet-marble read.
 * Everything is scaled by `shadeStrength`, so a 3px node still renders as the
 * flat, legible disc it needs to be.
 */
function drawPlanet(
  context: CanvasRenderingContext2D,
  item: Placed,
  radius: number,
  dark: boolean,
) {
  const strength = shadeStrength(radius);
  const base = dark ? lightenColor(item.node.color, 0.08) : item.node.color;

  context.beginPath();
  context.arc(item.sx, item.sy, radius, 0, Math.PI * 2);

  if (strength <= 0) {
    context.fillStyle = base;
    context.fill();
  } else {
    // Highlight sits off-centre toward the light; the gradient's far edge
    // reaches past the rim so the terminator lands on the silhouette itself.
    const hx = item.sx + LIGHT_X * radius * 0.55;
    const hy = item.sy + LIGHT_Y * radius * 0.55;
    const body = context.createRadialGradient(hx, hy, radius * 0.05, item.sx, item.sy, radius * 1.12);
    body.addColorStop(0, shade(base, 0.42 * strength));
    body.addColorStop(0.42, shade(base, 0.1 * strength));
    body.addColorStop(0.78, base);
    body.addColorStop(1, shade(base, -(dark ? 0.42 : 0.3) * strength));
    context.fillStyle = body;
    context.fill();
  }

  // Rim light on the shadow side: the arc opposite the light source, drawn
  // just inside the edge so it reads as a lit contour, not an outline.
  context.beginPath();
  context.arc(item.sx, item.sy, radius - 0.3, 0, Math.PI * 2);
  context.lineWidth = Math.max(0.6, radius * 0.06);
  context.strokeStyle = dark
    ? withAlpha(lightenColor(item.node.color, 0.5), 0.7)
    : withAlpha(darkenColor(item.node.color, 0.35), 0.45);
  context.stroke();

  if (strength <= 0) return;

  const rimAngle = Math.atan2(-LIGHT_Y, -LIGHT_X);
  context.beginPath();
  context.arc(item.sx, item.sy, radius - radius * 0.06, rimAngle - 1.05, rimAngle + 1.05);
  context.lineWidth = Math.max(0.5, radius * 0.09);
  context.strokeStyle = withAlpha(
    dark ? lightenColor(item.node.color, 0.8) : lightenColor(item.node.color, 0.55),
    (dark ? 0.5 : 0.34) * strength,
  );
  context.stroke();

  // Specular: small, tight, and only once the body is big enough to hold it.
  if (radius >= 5.5) {
    const sx = item.sx + LIGHT_X * radius * 0.52;
    const sy = item.sy + LIGHT_Y * radius * 0.52;
    const spec = context.createRadialGradient(sx, sy, 0, sx, sy, radius * 0.34);
    spec.addColorStop(0, `rgba(255,255,255,${(0.5 * strength).toFixed(3)})`);
    spec.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = spec;
    context.beginPath();
    context.arc(sx, sy, radius * 0.34, 0, Math.PI * 2);
    context.fill();
  }
}

/**
 * Tilted ring around a planet, split so the disc sits inside it.
 *
 * The back half is dimmed and the front half brightened toward the light, which
 * is what sells the ring as passing behind the sphere rather than being drawn
 * on top of it; the front half also takes the planet's shadow across its
 * far-from-light side.
 */
function drawPlanetRing(
  context: CanvasRenderingContext2D,
  item: Placed,
  radius: number,
  half: "back" | "front",
  ringMix: number,
  dark: boolean,
) {
  const tilt = -0.42;
  // Tighter and thinner than the body it belongs to: the ring is how a group
  // node is told apart from a hub, not an ornament in its own right.
  const ringRadius = radius * 1.7;
  const back = half === "back";

  context.save();
  context.translate(item.sx, item.sy);
  context.rotate(tilt);
  context.lineWidth = Math.max(0.6, radius * (back ? 0.075 : 0.1));
  // A lightened ring vanishes on a pale ground, so paper gets a darkened one.
  // The back arc runs dimmer than the front so the two halves read as depth.
  context.strokeStyle = dark
    ? withAlpha(lightenColor(item.node.color, back ? 0.4 : 0.72), (ringMix * 0.5 + 0.21) * (back ? 0.6 : 1))
    : withAlpha(darkenColor(item.node.color, back ? 0.12 : 0.38), back ? 0.28 : 0.5);
  context.beginPath();
  // Back half sweeps above the planet, front half below — together they read as
  // one ring threaded through the disc.
  context.ellipse(
    0,
    0,
    ringRadius,
    ringRadius * 0.3,
    0,
    back ? Math.PI : 0,
    back ? Math.PI * 2 : Math.PI,
  );
  context.stroke();
  context.restore();
}

/**
 * Tag body: a faceted four-point gem, not a flat spark.
 *
 * The old glyph was two crossed lozenges in one flat colour, which at small
 * sizes read as a smudge and at large sizes as clip-art. This builds the same
 * silhouette out of eight triangular facets — tip, waist, centre — and shades
 * each by how much its own outward normal faces the scene light, so the shape
 * has a visible crease down every arm and catches the same highlight as the
 * spheres beside it.
 */
function drawStar(
  context: CanvasRenderingContext2D,
  item: Placed,
  radius: number,
  dark: boolean,
) {
  const reach = radius * 1.15;
  const waist = radius * 0.42;
  const strength = shadeStrength(radius);
  const base = dark ? lightenColor(item.node.color, 0.22) : item.node.color;

  context.save();
  context.translate(item.sx, item.sy);

  // Eight facets: each spans centre → one tip → the neighbouring waist point.
  for (let facet = 0; facet < 8; facet += 1) {
    const tipAngle = (Math.PI / 2) * Math.floor(facet / 2);
    // Alternate which side of the arm the facet covers.
    const waistAngle = tipAngle + (facet % 2 === 0 ? -Math.PI / 4 : Math.PI / 4);

    const tx = Math.cos(tipAngle) * reach;
    const ty = Math.sin(tipAngle) * reach;
    const wx = Math.cos(waistAngle) * waist;
    const wy = Math.sin(waistAngle) * waist;

    // The facet tilts away from the arm's axis, so its normal is close to the
    // bisector of tip and waist — good enough to give each face a distinct
    // value without solving any actual geometry.
    const nx = (Math.cos(tipAngle) + Math.cos(waistAngle) * 2) / 3;
    const ny = (Math.sin(tipAngle) + Math.sin(waistAngle) * 2) / 3;
    const length = Math.hypot(nx, ny) || 1;
    const lit = (nx / length) * LIGHT_X + (ny / length) * LIGHT_Y;

    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(wx, wy);
    context.lineTo(tx, ty);
    context.closePath();
    context.fillStyle = shade(base, lit * (dark ? 0.5 : 0.34) * strength);
    context.fill();
  }

  // Hairline along the silhouette keeps the gem separated from the ground and
  // from a moon of the same colour.
  context.beginPath();
  for (let point = 0; point < 8; point += 1) {
    const angle = (Math.PI / 4) * point;
    const distance = point % 2 === 0 ? reach : waist;
    const px = Math.cos(angle) * distance;
    const py = Math.sin(angle) * distance;
    if (point === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.closePath();
  context.lineWidth = Math.max(0.5, radius * 0.06);
  context.strokeStyle = dark
    ? withAlpha(lightenColor(item.node.color, 0.7), 0.6)
    : withAlpha(darkenColor(item.node.color, 0.4), 0.45);
  context.stroke();

  // Core glint at the crossing point, where the eight facets meet.
  if (strength > 0 && radius >= 4) {
    const glint = context.createRadialGradient(0, 0, 0, 0, 0, waist * 1.1);
    glint.addColorStop(0, `rgba(255,255,255,${((dark ? 0.72 : 0.5) * strength).toFixed(3)})`);
    glint.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = glint;
    context.beginPath();
    context.arc(0, 0, waist * 1.1, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
}

/**
 * Moon: the same sphere model as a planet, dialled down.
 *
 * Leaves are the most numerous body on the canvas, so the shading is shallower
 * and the specular is dropped entirely — enough volume to belong to the same
 * scene, not enough to compete with the hubs.
 */
function drawMoon(
  context: CanvasRenderingContext2D,
  item: Placed,
  radius: number,
  dark: boolean,
) {
  const body = radius * 0.85;
  const strength = shadeStrength(body);
  const base = withAlpha(lightenColor(item.node.color, dark ? 0.2 : 0.05), 0.95);

  context.beginPath();
  context.arc(item.sx, item.sy, body, 0, Math.PI * 2);

  if (strength <= 0) {
    context.fillStyle = base;
    context.fill();
  } else {
    const hx = item.sx + LIGHT_X * body * 0.5;
    const hy = item.sy + LIGHT_Y * body * 0.5;
    const fill = context.createRadialGradient(hx, hy, body * 0.05, item.sx, item.sy, body * 1.1);
    fill.addColorStop(0, shade(base, 0.3 * strength));
    fill.addColorStop(0.7, base);
    fill.addColorStop(1, shade(base, -(dark ? 0.34 : 0.24) * strength));
    context.fillStyle = fill;
    context.fill();
  }

  context.beginPath();
  context.arc(item.sx, item.sy, body - 0.3, 0, Math.PI * 2);
  context.lineWidth = Math.max(0.6, radius * 0.08);
  context.strokeStyle = dark
    ? withAlpha(lightenColor(item.node.color, 0.5), 0.6)
    : withAlpha(darkenColor(item.node.color, 0.32), 0.45);
  context.stroke();
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function overlaps(a: Box, b: Box) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Clips a label to `maxWidth` px, ellipsis included. */
function truncate(context: CanvasRenderingContext2D, label: string, maxWidth: number) {
  if (context.measureText(label).width <= maxWidth) return label;
  let text = label;
  while (text.length > 1 && context.measureText(`${text}…`).width > maxWidth) {
    text = text.slice(0, -1);
  }
  return `${text}…`;
}
