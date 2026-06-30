"use client";

import { useLiveQuery } from "@/lib/storage/use-live-query";
import Graph from "graphology";
import circular from "graphology-layout/circular";
import forceAtlas2 from "graphology-layout-forceatlas2";
import Sigma from "sigma";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef, useState } from "react";

import { Card } from "@/components/ui/card";
import { kokuDb } from "@/lib/storage/db";
import { useNotes } from "@/lib/storage/hooks/use-notes";

interface GraphNode {
  id: string;
  title: string;
  tags: string[];
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
}

export function KnowledgeGraph() {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { notes } = useNotes();
  const noteLinks = useLiveQuery(() => kokuDb.noteLinks.toArray(), [], []);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);

  const isDark = resolvedTheme === "dark";

  const nodes = useMemo(
    () => notes.map((note) => ({ id: note.id, title: note.title, tags: note.tags })),
    [notes],
  );
  const edges = useMemo<GraphEdge[]>(
    () => noteLinks.map((link) => ({ id: link.id, source: link.sourceNoteId, target: link.targetNoteId })),
    [noteLinks],
  );

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const graph = new Graph();

    nodes.forEach((node) => {
      graph.addNode(node.id, {
        label: node.title,
        size: Math.max(8, edges.filter((edge) => edge.source === node.id || edge.target === node.id).length * 2 + 8),
        color: node.tags[0] ? "#e74c3c" : "#c0392b",
        x: Math.random(),
        y: Math.random(),
      });
    });

    edges.forEach((edge) => {
      if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
        graph.addEdgeWithKey(edge.id, edge.source, edge.target, {
          color: "rgba(192,57,43,0.45)",
          size: 1.5,
        });
      }
    });

    circular.assign(graph);
    forceAtlas2.assign(graph, { iterations: 80, settings: forceAtlas2.inferSettings(graph) });

    const labelColor = isDark ? "#e2e8f0" : "#1e293b";

    const sigma = new Sigma(graph, containerRef.current, {
      renderEdgeLabels: false,
      renderLabels: true,
      labelColor: { color: labelColor },
      labelSize: 13,
      labelWeight: "500",
    });

    // Keep canvas background in sync with the dark/light card colour.
    const canvas = containerRef.current.querySelector("canvas");
    if (canvas) {
      canvas.style.background = isDark
        ? "hsl(var(--card))"
        : "hsl(var(--card))";
    }

    sigma.on("clickNode", ({ node }) => {
      router.push(`/notes/${node}`);
    });

    sigma.on("enterNode", ({ node }) => {
      setHoveredNode(nodes.find((candidate) => candidate.id === node) || null);
    });

    sigma.on("leaveNode", () => {
      setHoveredNode(null);
    });

    return () => {
      sigma.kill();
    };
  }, [edges, isDark, nodes, router]);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-primary">Knowledge graph</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">See your ideas converge</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Explore linked notes, thematic clusters, and bridges between projects in one interactive canvas.
        </p>
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <div ref={containerRef} className="h-[720px] w-full" />
        {hoveredNode ? (
          <Card className="absolute right-4 top-4 max-w-xs border-primary/20 bg-card/95 p-4 shadow-lg">
            <p className="font-semibold text-foreground">{hoveredNode.title}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {hoveredNode.tags.length ? hoveredNode.tags.join(", ") : "No tags"}
            </p>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
