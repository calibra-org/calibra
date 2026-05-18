"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale } from "next-intl";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatMoney, formatNumber } from "#/lib/format";

interface RevenueBarChartProps {
    data: { label: string; value: number }[];
    height?: number;
    asMoney?: boolean;
}

export function RevenueBarChart({ data, height = 280, asMoney = true }: RevenueBarChartProps) {
    const locale = useLocale() as Locale;
    return (
        <ResponsiveContainer width="100%" height={height}>
            <BarChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis
                    tickFormatter={(value: number) =>
                        asMoney ? formatMoney(value, locale, { withSymbol: false }) : formatNumber(value, locale)
                    }
                    tickLine={false}
                    axisLine={false}
                    width={64}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                />
                <Tooltip
                    cursor={{ fill: "hsl(var(--accent))" }}
                    contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        color: "hsl(var(--popover-foreground))",
                        fontSize: 12,
                    }}
                    formatter={(value: number) => [asMoney ? formatMoney(value, locale) : formatNumber(value, locale), ""]}
                />
                <Bar dataKey="value" fill="hsl(var(--chart-2))" radius={[6, 6, 0, 0]} />
            </BarChart>
        </ResponsiveContainer>
    );
}
