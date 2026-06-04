"use client";

import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { TenantMetrics } from "#/lib/types";

/**
 * Native per-tenant chart (RULE D): revenue as a filled area + orders as an overlaid line, sharing
 * the time axis. Uses recharts — the sanctioned charting library reused from the admin analytics.
 * Colors reference the shadcn HSL token set so the chart follows the theme.
 */
export function MetricsChart({ series }: { series: TenantMetrics["series"] }) {
    return (
        <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                    <defs>
                        <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" minTickGap={24} />
                    <YAxis yAxisId="rev" hide />
                    <YAxis yAxisId="ord" orientation="right" hide />
                    <Tooltip
                        contentStyle={{
                            background: "hsl(var(--popover))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: 8,
                            fontSize: 12,
                        }}
                    />
                    <Area
                        yAxisId="rev"
                        type="monotone"
                        dataKey="revenue"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        fill="url(#rev)"
                    />
                    <Line
                        yAxisId="ord"
                        type="monotone"
                        dataKey="orders"
                        stroke="hsl(var(--info-foreground))"
                        strokeWidth={1.5}
                        dot={false}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
