"use client";

import { useReducedMotion } from "motion/react";
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { TenantMetrics } from "#/lib/types";

/**
 * Native per-tenant chart: revenue as a filled area + orders as an overlaid line, sharing the time
 * axis. Revenue rides the signature violet accent; orders use the electric-cyan data accent so the
 * two series read apart. Recharts draws the series in on mount unless reduced motion is requested.
 * Colours reference the shadcn HSL token set so the chart follows the console theme.
 */
export function MetricsChart({ series }: { series: TenantMetrics["series"] }) {
    const reduce = useReducedMotion();
    return (
        <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                    <defs>
                        <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
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
                        isAnimationActive={!reduce}
                        animationDuration={700}
                        animationEasing="ease-out"
                    />
                    <Line
                        yAxisId="ord"
                        type="monotone"
                        dataKey="orders"
                        stroke="hsl(var(--chart-2))"
                        strokeWidth={1.5}
                        dot={false}
                        isAnimationActive={!reduce}
                        animationDuration={700}
                        animationEasing="ease-out"
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
