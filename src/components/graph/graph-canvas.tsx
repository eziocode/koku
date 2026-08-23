"use client";

import Graph from "graphology";
import circular from "graphology-layout/circular";
import forceAtlas2 from "graphology-layout-forceatlas2";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef } from "react";
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

interface GraphCanvasProps {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  isDark: boolean;
  /** Nodes matching an active search/filter stay lit; everything else fades. */
  highlightIds?: Set<string> | null;
  onNodeClick?: (id: string) => void;
  onNodeHover?: (id: string | null) => void;
  className?: string;
}

/**
 * Shared Sigma renderer for both graph tabs.
 *
 * Colour comes from the caller (one colour per group), and this component owns
 * the interaction model: hovering a node keeps it and its neighbours saturated
 * while the rest of the graph fades back, which is what makes a multi-coloured
 * graph readable once it has more than a handful of nodes.
 */
export function GraphCanvas({
  nodes,
  edges,
  isDark,
  highlightIds,
  onNodeClick,
  onNodeHover,
  className,
}: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const hoveredRef = useRef<string | null>(null);
  const highlightRef = useRef<Set<string> | null>(highlightIds ?? null);
  const callbacksRef = useRef({ onNodeClick, onNodeHover });

  useEffect(() => {
    callbacksRef.current = { onNodeClick, onNodeHover };
  }, [onNodeClick, onNodeHover]);

  useEffect(() => {
    highlightRef.current = highlightIds ?? null;
    sigmaRef.current?.refresh();
  }, [highlightIds]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const graph = new Graph();

    nodes.forEach((node) => {
      graph.addNode(node.id, {
        label: node.label,
        color: node.color,
        size: node.size,
        x: 0,
        y: 0,
      });
    });

    edges.forEach((edge) => {
      if (
        !graph.hasNode(edge.source) ||
        !graph.hasNode(edge.target) ||
        graph.hasEdge(edge.source, edge.target)
      ) {
        return;
      }

      graph.addEdgeWithKey(edge.id, edge.source, edge.target, {
        size: 0.6 + (edge.weight ?? 0) * 2.4,
      });
    });

    // Circular seeding keeps the layout deterministic across renders; ForceAtlas2
    // then pulls linked clusters together.
    if (graph.order > 0) {
      circular.assign(graph);
      if (graph.size > 0) {
        forceAtlas2.assign(graph, {
          iterations: graph.order > 400 ? 120 : 240,
          settings: {
            ...forceAtlas2.inferSettings(graph),
            gravity: 0.6,
            scalingRatio: 12,
          },
        });
      }
    }

    const edgeBase = isDark ? "#94a3b8" : "#64748b";
    const labelColor = isDark ? "#e2e8f0" : "#1e293b";

    const sigma = new Sigma(graph, container, {
      renderEdgeLabels: false,
      renderLabels: true,
      labelColor: { color: labelColor },
      labelSize: 12,
      labelWeight: "500",
      labelDensity: 0.6,
      labelRenderedSizeThreshold: 6,
      defaultEdgeColor: withAlpha(edgeBase, 0.28),
      zIndex: true,
      minCameraRatio: 0.05,
      maxCameraRatio: 12,
      nodeReducer: (node, data) => {
        const hovered = hoveredRef.current;
        const highlight = highlightRef.current;

        const dimmedBySearch = highlight ? !highlight.has(node) : false;
        const dimmedByHover = hovered
          ? node !== hovered && !graph.areNeighbors(hovered, node)
          : false;
        const dimmed = dimmedBySearch || dimmedByHover;

        if (!dimmed) {
          return {
            ...data,
            zIndex: node === hovered ? 2 : 1,
            size: node === hovered ? data.size * 1.25 : data.size,
          };
        }

        return {
          ...data,
          color: fadeColor(data.color as string, 0.78, isDark),
          label: null,
          zIndex: 0,
        };
      },
      edgeReducer: (edge, data) => {
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

    sigma.on("clickNode", ({ node }) => callbacksRef.current.onNodeClick?.(node));
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

    sigmaRef.current = sigma;

    return () => {
      sigmaRef.current = null;
      hoveredRef.current = null;
      sigma.kill();
    };
  }, [edges, isDark, nodes]);

  function zoom(direction: "in" | "out" | "reset") {
    const camera = sigmaRef.current?.getCamera();
    if (!camera) {
      return;
    }
    if (direction === "in") {
      camera.animatedZoom({ duration: 220 });
    } else if (direction === "out") {
      camera.animatedUnzoom({ duration: 220 });
    } else {
      camera.animatedReset({ duration: 260 });
    }
  }

  return (
    <div className={cn("relative", className)}>
      <div ref={containerRef} className="h-full w-full" />
      <div className="absolute bottom-4 left-4 flex flex-col overflow-hidden rounded-lg border border-border bg-card/90 shadow-sm backdrop-blur">
        <button
          type="button"
          onClick={() => zoom("in")}
          aria-label="Zoom in"
          className="p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
