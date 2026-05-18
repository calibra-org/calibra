"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale } from "next-intl";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatDate, formatMoney } from "#/lib/format";

interface SalesAreaChartProps {
    data: { date: string; revenue: number }[];
    height?: number;
}

export function SalesAreaChart({ data, height = 260 }: SalesAreaChartProps) {
    const locale = useLocale() as Locale;
    return (
        <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <defs>
                    <linearGradient id="salesArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                    dataKey="date"
                    tickFormatter={(value) => formatDate(value, locale, { month: "short", day: "numeric" })}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                    tickFormatter={(value: number) => formatMoney(value, locale, { withSymbol: false })}
                    tickLine={false}
                    axisLine={false}
                    width={60}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                />
                <Tooltip
                    cursor={{ stroke: "hsl(var(--ring))", strokeDasharray: 3 }}
                    contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        color: "hsl(var(--popover-foreground))",
                        fontSize: 12,
                    }}
                    labelFormatter={(value) => formatDate(String(value), locale)}
                    formatter={(value: number) => [formatMoney(value, locale), ""]}
                />
                <Area type="monotone" dataKey="revenue" stroke="hsl(var(--chart-1))" strokeWidth={2} fill="url(#salesArea)" />
            </AreaChart>
        </ResponsiveContainer>
    );
}
