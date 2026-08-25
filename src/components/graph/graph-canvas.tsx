"use client";

import Graph from "graphology";
import circular from "graphology-layout/circular";
import forceAtlas2 from "graphology-layout-forceatlas2";
import { Maximize2, Pause, Play, Pin, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import Sigma from "sigma";

import { fadeColor, withAlpha } from "@/lib/graph/palette";
import { cn } from "@/lib/utils";

export interface CanvasNode {
  id: string;
  label: string;
  color: string;
  size: number;
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

/**
 * Shared Sigma renderer for both graph tabs.
 *
 * Colour comes from the caller (one colour per group), and this component owns
 * the interaction model: hovering a node keeps it and its neighbours saturated
 * while the rest of the graph fades back, which is what makes a multi-coloured
 * graph readable once it has more than a handful of nodes.
 *
 * Layout runs as a live ForceAtlas2 simulation in a web worker, so the graph
 * settles visibly and can be dragged around like Obsidian's graph view. Nodes
 * are pinned where you drop them; the pin control releases them all.
 *
 * The Sigma instance is created **once** and then mutated in place. Recreating
 * it whenever `nodes`/`edges` change (they are fresh array identities on every
 * parent render) would re-seed the layout and reset the camera on every filter
 * keystroke — filters should dim nodes, never move them.
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
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const frameRef = useRef<number | null>(null);

  const hoveredRef = useRef<string | null>(null);
  const draggedRef = useRef<string | null>(null);
  const highlightRef = useRef<Set<string> | null>(highlightIds ?? null);
  const isDarkRef = useRef(isDark);
  const callbacksRef = useRef({ onNodeClick, onNodeHover });

  const [running, setRunning] = useState(true);
  const [hasPins, setHasPins] = useState(false);

  useEffect(() => {
    callbacksRef.current = { onNodeClick, onNodeHover };
  }, [onNodeClick, onNodeHover]);

  useEffect(() => {
    highlightRef.current = highlightIds ?? null;
    sigmaRef.current?.refresh();
  }, [highlightIds]);

  // ── Create Sigma once ─────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const graph = new Graph();
    graphRef.current = graph;

    const edgeBaseFor = (dark: boolean) => (dark ? "#94a3b8" : "#64748b");

    const sigma = new Sigma(graph, container, {
      renderEdgeLabels: false,
      renderLabels: true,
      labelSize: 12,
      labelWeight: "500",
      labelDensity: 0.6,
      labelRenderedSizeThreshold: 6,
      zIndex: true,
      minCameraRatio: 0.05,
      maxCameraRatio: 12,
      // Sigma's default hover renderer uses a white label bubble. In dark
      // mode that bubble plus white label makes hovered text disappear.
      defaultDrawNodeHover: (context, data, settings) => {
        const label = data.label;
        if (!label) return;
        const dark = isDarkRef.current;
        const labelSize = settings.labelSize;
        const width = context.measureText(label).width + 12;
        const height = labelSize + 8;
        context.save();
        context.fillStyle = dark ? "#0f172a" : "#ffffff";
        context.strokeStyle = dark ? "#475569" : "#cbd5e1";
        context.lineWidth = 1;
        context.shadowColor = dark ? "rgba(0,0,0,.55)" : "rgba(15,23,42,.18)";
        context.shadowBlur = 8;
        context.beginPath();
        context.roundRect(data.x + data.size + 2, data.y - height / 2, width, height, 5);
        context.fill();
        context.stroke();
        context.shadowBlur = 0;
        context.fillStyle = dark ? "#f8fafc" : "#0f172a";
        context.font = `${settings.labelWeight} ${labelSize}px ${settings.labelFont}`;
        context.fillText(label, data.x + data.size + 8, data.y + labelSize / 3);
        context.restore();
      },
      nodeReducer: (node, data) => {
        const dark = isDarkRef.current;
        const hovered = hoveredRef.current;
        const highlight = highlightRef.current;

        const dimmedBySearch = highlight ? !highlight.has(node) : false;
        const dimmedByHover = hovered
          ? node !== hovered && !graph.areNeighbors(hovered, node)
          : false;

        if (!dimmedBySearch && !dimmedByHover) {
          const focused = node === hovered || node === draggedRef.current;
          return {
            ...data,
            zIndex: focused ? 2 : 1,
            size: focused ? (data.size as number) * 1.25 : data.size,
          };
        }

        return {
          ...data,
          color: fadeColor(data.color as string, 0.78, dark),
          label: null,
          zIndex: 0,
        };
      },
      edgeReducer: (edge, data) => {
        const dark = isDarkRef.current;
        const edgeBase = edgeBaseFor(dark);
        const hovered = hoveredRef.current;
        const highlight = highlightRef.current;
        const [source, target] = graph.extremities(edge);

        const touchesHover = !hovered || source === hovered || target === hovered;
        const inHighlight = !highlight || (highlight.has(source) && highlight.has(target));

        if (touchesHover && inHighlight) {
          return {
            ...data,
            color: hovered
              ? withAlpha(graph.getNodeAttribute(hovered, "color") as string, 0.75)
              : withAlpha(edgeBase, 0.28),
            zIndex: hovered ? 1 : 0,
          };
        }

        return { ...data, color: withAlpha(edgeBase, 0.06), zIndex: 0 };
      },
    });

    sigmaRef.current = sigma;

    sigma.on("enterNode", ({ node }) => {
      hoveredRef.current = node;
      callbacksRef.current.onNodeHover?.(node);
      sigma.refresh();
    });
    sigma.on("leaveNode", () => {
      hoveredRef.current = null;
      callbacksRef.current.onNodeHover?.(null);
      sigma.refresh();
    });

    // ── Drag to reposition ──────────────────────────────────────────────────
    // A drag is distinguished from a click by whether the pointer actually
    // moved, so click-to-open still works on a node you merely tapped.
    let moved = false;

    sigma.on("downNode", ({ node }) => {
      draggedRef.current = node;
      moved = false;
      graph.setNodeAttribute(node, "highlighted", true);
    });

    sigma.getMouseCaptor().on("mousemovebody", (event) => {
      const node = draggedRef.current;
      if (!node) return;
      moved = true;
      const position = sigma.viewportToGraph(event);
      graph.setNodeAttribute(node, "x", position.x);
      graph.setNodeAttribute(node, "y", position.y);
      // Pin it so the running simulation does not yank it back.
      graph.setNodeAttribute(node, "fixed", true);
      setHasPins(true);
      // Stop Sigma from panning the camera while a node is in hand.
      event.preventSigmaDefault();
      event.original.preventDefault();
      event.original.stopPropagation();
    });

    const releaseDrag = () => {
      const node = draggedRef.current;
      if (!node) return;
      graph.removeNodeAttribute(node, "highlighted");
      if (!moved) {
        callbacksRef.current.onNodeClick?.(node);
      }
      draggedRef.current = null;
      moved = false;
      sigma.refresh();
    };

    sigma.getMouseCaptor().on("mouseup", releaseDrag);
    sigma.getMouseCaptor().on("mouseleave", releaseDrag);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      sigmaRef.current = null;
      graphRef.current = null;
      hoveredRef.current = null;
      draggedRef.current = null;
      sigma.kill();
    };
  }, []);

  // Theme lives in a ref so a light/dark flip repaints without rebuilding the
  // graph — `resolvedTheme` is undefined on first paint and would otherwise
  // re-seed the layout one frame in.
  useEffect(() => {
    isDarkRef.current = isDark;
    sigmaRef.current?.refresh();
  }, [isDark]);

  // ── Sync graph data in place ──────────────────────────────────────────────
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;

    const nextNodeIds = new Set(nodes.map((node) => node.id));
    const nextEdgeIds = new Set<string>();

    // Nodes that vanished (deleted note, narrowed filter) go first so their
    // edges are dropped with them.
    graph.forEachNode((id) => {
      if (!nextNodeIds.has(id)) graph.dropNode(id);
    });

    let added = 0;
    nodes.forEach((node) => {
      if (graph.hasNode(node.id)) {
        // Keep x/y/fixed — only refresh presentation.
        graph.mergeNodeAttributes(node.id, {
          label: node.label,
          color: node.color,
          size: node.size,
        });
        return;
      }
      // New nodes land at the origin; the layout pass below seeds them.
      graph.addNode(node.id, { ...node, x: 0, y: 0 });
      added += 1;
    });

    edges.forEach((edge) => {
      if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) return;
      const size = 0.6 + (edge.weight ?? 0) * 2.4;
      const existing = graph.edge(edge.source, edge.target);
      if (existing) {
        nextEdgeIds.add(existing);
        graph.setEdgeAttribute(existing, "size", size);
        return;
      }
      graph.addEdgeWithKey(edge.id, edge.source, edge.target, { size });
      nextEdgeIds.add(edge.id);
    });

    graph.forEachEdge((id) => {
      if (!nextEdgeIds.has(id)) graph.dropEdge(id);
    });

    // Seed only when the graph is genuinely new — re-seeding on every filter
    // change is what made the old canvas jump around.
    if (added > 0 && added === graph.order && graph.order > 0) {
      circular.assign(graph);
      if (graph.size > 0) {
        forceAtlas2.assign(graph, {
          iterations: graph.order > 400 ? 60 : 120,
          settings: { ...forceAtlas2.inferSettings(graph), ...forces },
        });
      }
      sigmaRef.current?.getCamera().animatedReset({ duration: 200 });
    }

    setHasPins(graph.someNode((_id, attr) => attr.fixed === true));
    // `forces` is read only to seed brand-new graphs; the live simulation below
    // owns it after that, so it is deliberately not a dependency here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  // ── Live simulation ───────────────────────────────────────────────────────
  // Runs on the main thread in an animation loop rather than in graphology's
  // web worker: the worker is built from a blob URL, which this app's CSP
  // (`worker-src 'self'`) blocks outright. A few iterations per frame is
  // cheap at note-graph scale and gives the same settling motion.
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    if (!running || graph.order === 0 || graph.size === 0) return;

    const settings = { ...forceAtlas2.inferSettings(graph), ...forces };
    // Bigger graphs get fewer iterations per frame so a frame stays cheap.
    const perFrame = graph.order > 300 ? 1 : graph.order > 80 ? 2 : 3;

    const tick = () => {
      const current = graphRef.current;
      if (!current) return;
      forceAtlas2.assign(current, { iterations: perFrame, settings });
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [running, forces, nodes.length, edges.length]);

  const zoom = useCallback((direction: "in" | "out" | "reset") => {
    const camera = sigmaRef.current?.getCamera();
    if (!camera) return;
    if (direction === "in") camera.animatedZoom({ duration: 220 });
    else if (direction === "out") camera.animatedUnzoom({ duration: 220 });
    else camera.animatedReset({ duration: 260 });
  }, []);

  const releasePins = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.forEachNode((id) => graph.removeNodeAttribute(id, "fixed"));
    setHasPins(false);
    setRunning(true);
  }, []);

  return (
    <div className={cn("relative", className)}>
      <div ref={containerRef} className="h-full w-full" />

      <div className="absolute bottom-4 left-4 flex flex-col overflow-hidden rounded-lg border border-border bg-card/90 shadow-sm backdrop-blur">
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
          className="border-t border-border p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <Pin className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => zoom("in")}
          aria-label="Zoom in"
          className="border-t border-border p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => zoom("out")}
          aria-label="Zoom out"
          className="border-t border-border p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => zoom("reset")}
          aria-label="Fit graph to view"
          className="border-t border-border p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
