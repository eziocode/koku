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
          <Tooltip cursor={{ fill: "rgba(192,57,43,0.08)" }} />
          <Bar dataKey="hours" radius={[8, 8, 0, 0]} fill="#c0392b" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
