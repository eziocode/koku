"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface DailyBarChartProps {
  data: Array<{ label: string; hours: number }>;
}

export function DailyBarChart({ data }: DailyBarChartProps) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(107, 114, 128, 0.15)" />
          <XAxis dataKey="label" stroke="currentColor" tickLine={false} axisLine={false} />
          <YAxis stroke="currentColor" tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ fill: "rgba(192,57,43,0.08)" }}
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "0.75rem",
              color: "hsl(var(--foreground))",
              boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
            }}
            labelStyle={{ color: "hsl(var(--muted-foreground))", marginBottom: "4px" }}
            itemStyle={{ color: "hsl(var(--foreground))" }}
            formatter={(value) => {
              const num = typeof value === "number" ? value : Number(value ?? 0);
              return [`${num.toFixed(2)} h`, "Hours"];
            }}
          />
          <Bar dataKey="hours" radius={[8, 8, 0, 0]} fill="#c0392b" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
