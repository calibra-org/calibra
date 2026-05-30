"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale, useTranslations } from "next-intl";
import { useId } from "react";
import { Area, AreaChart, CartesianGrid, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { CardContent, CardHeader, CardRoot, CardTitle } from "#/components/ui/card";
import { Skeleton } from "#/components/ui/skeleton";
import { formatDate, formatMoney, formatNumber } from "#/lib/format";

export interface SeriesPoint {
    date: string;
    value: number;
    compare?: number;
}

/** Visual category for the chart — drives the line + gradient colour. Matches StatCard tones. */
export type SeriesChartTone = "default" | "success" | "info" | "warning" | "danger";

const TONE_STROKE: Record<SeriesChartTone, string> = {
    default: "hsl(var(--chart-1))",
    success: "hsl(var(--success))",
    info: "hsl(var(--info))",
    warning: "hsl(var(--warning))",
    danger: "hsl(var(--danger))",
};

interface ReportSeriesChartProps {
    title: string;
    data: SeriesPoint[];
    kind: "money" | "number";
    currentLabel: string;
    compareLabel?: string;
    showCompare?: boolean;
    isLoading?: boolean;
    height?: number;
    tone?: SeriesChartTone;
}

/**
 * Analytics line chart with a soft gradient fill beneath the curve. One current series plus an
 * optional dashed comparison overlay; locale-aware money / count formatting on the axis +
 * tooltip; legend appears only when comparison is on. `tone` drives the stroke + gradient colour
 * so charts on the same dashboard read as distinct categories at a glance. Empty windows show an
 * explicit message rather than a stranded axis.
 */
export function ReportSeriesChart({
    title,
    data,
    kind,
    currentLabel,
    compareLabel,
    showCompare = false,
    isLoading = false,
    height = 280,
    tone = "default",
}: ReportSeriesChartProps) {
    const locale = useLocale() as Locale;
    const t = useTranslations("Analytics");
    const gradientId = useId();
    const stroke = TONE_STROKE[tone];
    const fmt = (value: number) =>
        kind === "money" ? formatMoney(value, locale, { withSymbol: false }) : formatNumber(value, locale);
    const hasData = data.some((d) => d.value !== 0 || (d.compare ?? 0) !== 0);

    return (
        <CardRoot className="gap-0 p-0">
            <CardHeader className="px-5 pt-5 pb-3">
                <CardTitle className="text-base">{title}</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-3">
                {isLoading ? (
                    <Skeleton className="mx-3 rounded-md" style={{ height }} />
                ) : hasData ? (
                    <ResponsiveContainer width="100%" height={height}>
                        <AreaChart data={data} margin={{ top: 10, right: 6, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
                                    <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                            <XAxis
                                dataKey="date"
                                tickFormatter={(value) => formatDate(value, locale, { month: "short", day: "numeric" })}
                                tickLine={false}
                                axisLine={false}
                                tickMargin={6}
                                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                            />
                            <YAxis
                                tickFormatter={(value: number) => fmt(value)}
                                tickLine={false}
                                axisLine={false}
                                width={56}
                                tickMargin={4}
                                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                            />
                            <Tooltip
                                cursor={{ stroke, strokeDasharray: 3, strokeWidth: 1.5 }}
                                contentStyle={{
                                    background: "hsl(var(--popover))",
                                    border: "1px solid hsl(var(--border))",
                                    borderRadius: 8,
                                    color: "hsl(var(--popover-foreground))",
                                    fontSize: 12,
                                }}
                                labelFormatter={(value) => formatDate(String(value), locale)}
                                formatter={(value: number, key) => [
                                    fmt(value),
                                    key === "value" ? currentLabel : (compareLabel ?? ""),
                                ]}
                            />
                            {showCompare && compareLabel !== undefined && (
                                <Legend
                                    iconType="circle"
                                    wrapperStyle={{ fontSize: 12, color: "hsl(var(--muted-foreground))", paddingTop: 6 }}
                                    formatter={(key) => (key === "value" ? currentLabel : compareLabel)}
                                />
                            )}
                            <Area
                                type="monotone"
                                dataKey="value"
                                stroke={stroke}
                                strokeWidth={2.25}
                                fill={`url(#${gradientId})`}
                                activeDot={{ r: 4, strokeWidth: 0 }}
                            />
                            {showCompare && (
                                <Line
                                    type="monotone"
                                    dataKey="compare"
                                    stroke="hsl(var(--muted-foreground))"
                                    strokeWidth={1.75}
                                    strokeDasharray="4 4"
                                    dot={false}
                                    activeDot={{ r: 3, strokeWidth: 0 }}
                                />
                            )}
                        </AreaChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="grid place-items-center text-muted-foreground text-sm" style={{ height }}>
                        {t("empty")}
                    </div>
                )}
            </CardContent>
        </CardRoot>
    );
}
