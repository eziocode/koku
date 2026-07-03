"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartEmpty } from "@/components/charts/chart-states";
import { CHART_TOKENS } from "@/lib/charts/theme";

interface TrendLineChartProps {
  data: Array<{ label: string; hours: number }>;
  height?: number;
}

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const hours = payload[0]?.value ?? 0;
  return (
    <div className="rounded-xl border border-border/80 bg-popover px-3 py-2 text-popover-foreground shadow-xl shadow-foreground/10">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{Number(hours).toFixed(2)} h</p>
    </div>
  );
}

export function TrendLineChart({ data, height = 288 }: TrendLineChartProps) {
  const hasData = data.some((d) => d.hours > 0);

  if (!hasData) {
    return (
      <ChartEmpty
        height={height}
        title="No trend yet"
        description="Momentum over time appears once you log a few days."
      />
    );
  }

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -12 }}>
          <defs>
            <linearGradient id="koku-trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={CHART_TOKENS.grid} strokeDasharray="4 4" />
          <XAxis dataKey="label" stroke={CHART_TOKENS.axis} tickLine={false} axisLine={false} fontSize={12} dy={6} />
          <YAxis
            stroke={CHART_TOKENS.axis}
            tickLine={false}
            axisLine={false}
            fontSize={12}
            width={44}
            tickFormatter={(value: number) => `${value}h`}
          />
          <Tooltip content={<TrendTooltip />} wrapperStyle={{ outline: "none" }} />
          <Area
            type="monotone"
            dataKey="hours"
            stroke="var(--color-primary)"
            strokeWidth={2.5}
            fill="url(#koku-trend-fill)"
            animationDuration={CHART_TOKENS.animationDuration}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-card)" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
