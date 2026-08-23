"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Sigma uses WebGL2 which is browser-only — must skip SSR.
const KnowledgeGraph = dynamic(
  () => import("@/components/graph/knowledge-graph").then((m) => m.KnowledgeGraph),
  { ssr: false },
);

const LoggerGraph = dynamic(
  () => import("@/components/graph/logger-graph").then((m) => m.LoggerGraph),
  { ssr: false },
);

const COPY = {
  notes: {
    eyebrow: "Knowledge graph",
    title: "See your ideas converge",
    body: "Explore linked notes, thematic clusters, and bridges between projects in one interactive canvas.",
  },
  loggers: {
    eyebrow: "Logger graph",
    title: "See where your hours actually go",
    body: "Categories, projects, and tags connected by the time you logged against them. Filter the range, then follow the thickest links.",
  },
} as const;

type GraphTab = keyof typeof COPY;

export function GraphClient() {
  const [tab, setTab] = useState<GraphTab>("notes");
  const copy = COPY[tab];

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-primary">{copy.eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{copy.title}</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">{copy.body}</p>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as GraphTab)}>
        <TabsList>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="loggers">Loggers</TabsTrigger>
        </TabsList>

        {/* Each graph stays mounted only while visible so Sigma tears down its
            WebGL context when you switch tabs. */}
        <TabsContent value="notes">
          {tab === "notes" ? <KnowledgeGraph /> : null}
        </TabsContent>
        <TabsContent value="loggers">
          {tab === "loggers" ? <LoggerGraph /> : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
