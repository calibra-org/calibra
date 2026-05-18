"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale, useTranslations } from "next-intl";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatDate, formatMoney } from "#/lib/format";

interface SalesComparisonChartProps {
    data: { date: string; revenue: number; refunded: number }[];
    height?: number;
}

export function SalesComparisonChart({ data, height = 320 }: SalesComparisonChartProps) {
    const locale = useLocale() as Locale;
    const t = useTranslations("ReportsLegend");
    return (
        <ResponsiveContainer width="100%" height={height}>
            <LineChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
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
                    width={68}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                />
                <Tooltip
                    contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        color: "hsl(var(--popover-foreground))",
                        fontSize: 12,
                    }}
                    labelFormatter={(value) => formatDate(String(value), locale)}
                    formatter={(value: number, name) => [formatMoney(value, locale), name]}
                />
                <Legend
                    wrapperStyle={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}
                    formatter={(key) => (key === "revenue" ? t("revenue") : t("refunded"))}
                />
                <Line type="monotone" dataKey="revenue" stroke="hsl(var(--chart-1))" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="refunded" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
            </LineChart>
        </ResponsiveContainer>
    );
}
