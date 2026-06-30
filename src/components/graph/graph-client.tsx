"use client";

import dynamic from "next/dynamic";

// Sigma uses WebGL2 which is browser-only — must skip SSR.
const KnowledgeGraph = dynamic(
  () => import("@/components/graph/knowledge-graph").then((m) => m.KnowledgeGraph),
  { ssr: false },
);

export function GraphClient() {
  return <KnowledgeGraph />;
}
