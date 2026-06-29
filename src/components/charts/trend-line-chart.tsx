"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface TrendLineChartProps {
  data: Array<{ label: string; hours: number }>;
}

export function TrendLineChart({ data }: TrendLineChartProps) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(107, 114, 128, 0.15)" />
          <XAxis dataKey="label" stroke="currentColor" tickLine={false} axisLine={false} />
          <YAxis stroke="currentColor" tickLine={false} axisLine={false} />
          <Tooltip />
          <Line type="monotone" dataKey="hours" stroke="#e74c3c" strokeWidth={3} dot={{ fill: "#c0392b" }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
