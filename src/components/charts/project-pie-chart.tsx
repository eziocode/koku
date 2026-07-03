"use client";

import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { ChartEmpty } from "@/components/charts/chart-states";
import { CHART_TOKENS } from "@/lib/charts/theme";
import { formatDuration } from "@/lib/utils";

interface ProjectPieChartProps {
  data: Array<{ name: string; value: number; color: string; seconds?: number }>;
  height?: number;
}

function PieTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: { name: string; value: number; color: string; seconds?: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;
  return (
    <div className="rounded-xl border border-border/80 bg-popover px-3 py-2 text-popover-foreground shadow-xl shadow-foreground/10">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} aria-hidden />
        <span className="text-sm font-semibold">{item.name}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {item.seconds != null ? formatDuration(item.seconds) : `${item.value.toFixed(2)} h`}
      </p>
    </div>
  );
}

export function ProjectPieChart({ data, height = 320 }: ProjectPieChartProps) {
  const total = useMemo(() => data.reduce((sum, d) => sum + d.value, 0), [data]);

  if (!data.length || total === 0) {
    return (
      <ChartEmpty
        height={height}
        title="No project data"
        description="Assign entries to projects to see how time is distributed."
      />
    );
  }

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="58%"
            outerRadius="82%"
            paddingAngle={3}
            stroke="var(--color-card)"
            strokeWidth={2}
            animationDuration={CHART_TOKENS.animationDuration}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<PieTooltip />} wrapperStyle={{ outline: "none" }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
