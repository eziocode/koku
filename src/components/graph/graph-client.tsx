"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import { cn } from "@/lib/utils";

// Sigma uses WebGL2 which is browser-only — must skip SSR.
const KnowledgeGraph = dynamic(
  () => import("@/components/graph/knowledge-graph").then((m) => m.KnowledgeGraph),
  { ssr: false },
);

const LoggerGraph = dynamic(
  () => import("@/components/graph/logger-graph").then((m) => m.LoggerGraph),
  { ssr: false },
);

const TABS = [
  { value: "notes", label: "Notes" },
  { value: "loggers", label: "Loggers" },
] as const;

type GraphTab = (typeof TABS)[number]["value"];

export function GraphClient() {
  const [tab, setTab] = useState<GraphTab>("notes");

  return (
    <div className="flex flex-col gap-3">
      {/* Deliberately minimal chrome: the graph is the page, so the tab switch
          sits on one line instead of under a marketing hero. */}
      <div className="inline-flex w-fit rounded-lg border border-border bg-muted/40 p-1">
        {TABS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setTab(item.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              tab === item.value
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Each graph mounts only while visible so Sigma tears down its WebGL
          context and stops its layout worker when you switch tabs. */}
      {tab === "notes" ? <KnowledgeGraph /> : <LoggerGraph />}
    </div>
  );
}
