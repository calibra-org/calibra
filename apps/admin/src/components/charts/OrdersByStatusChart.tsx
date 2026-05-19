"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale, useTranslations } from "next-intl";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { formatNumber } from "#/lib/format";
import type { OrderStatus } from "#/lib/types";

interface OrdersByStatusChartProps {
    data: { status: OrderStatus; count: number }[];
    height?: number;
}

const palette: Record<OrderStatus, string> = {
    draft: "hsl(var(--chart-3))",
    pending: "hsl(var(--chart-4))",
    on_hold: "hsl(var(--chart-5))",
    processing: "hsl(var(--chart-1))",
    completed: "hsl(var(--chart-2))",
    cancelled: "hsl(var(--muted-foreground))",
    refunded: "hsl(var(--destructive))",
    failed: "hsl(var(--destructive))",
};

export function OrdersByStatusChart({ data, height = 260 }: OrdersByStatusChartProps) {
    const locale = useLocale() as Locale;
    const t = useTranslations("OrderStatus");
    return (
        <ResponsiveContainer width="100%" height={height}>
            <PieChart>
                <Pie
                    data={data.map((row) => ({ ...row, name: t(row.status), value: row.count }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius="55%"
                    outerRadius="80%"
                    paddingAngle={3}
                    stroke="hsl(var(--card))"
                    strokeWidth={2}
                >
                    {data.map((row) => (
                        <Cell key={row.status} fill={palette[row.status]} />
                    ))}
                </Pie>
                <Tooltip
                    contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        color: "hsl(var(--popover-foreground))",
                        fontSize: 12,
                    }}
                    formatter={(value: number, name) => [formatNumber(value, locale), name]}
                />
            </PieChart>
        </ResponsiveContainer>
    );
}
