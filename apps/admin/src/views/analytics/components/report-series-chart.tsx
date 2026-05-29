"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale, useTranslations } from "next-intl";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { CardContent, CardHeader, CardRoot, CardTitle } from "#/components/ui/card";
import { Skeleton } from "#/components/ui/skeleton";
import { formatDate, formatMoney, formatNumber } from "#/lib/format";

export interface SeriesPoint {
    date: string;
    value: number;
    compare?: number;
}

interface ReportSeriesChartProps {
    title: string;
    data: SeriesPoint[];
    kind: "money" | "number";
    currentLabel: string;
    compareLabel?: string;
    showCompare?: boolean;
    isLoading?: boolean;
    height?: number;
}

/**
 * Generic analytics line chart: one current series plus an optional dashed comparison overlay,
 * locale-aware money / count formatting on the axis + tooltip, and a legend. Empty windows show an
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
    height = 300,
}: ReportSeriesChartProps) {
    const locale = useLocale() as Locale;
    const t = useTranslations("Analytics");
    const fmt = (value: number) =>
        kind === "money" ? formatMoney(value, locale, { withSymbol: false }) : formatNumber(value, locale);
    const hasData = data.some((d) => d.value !== 0 || (d.compare ?? 0) !== 0);

    return (
        <CardRoot>
            <CardHeader>
                <CardTitle className="text-base">{title}</CardTitle>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <Skeleton className="w-full rounded-md" style={{ height }} />
                ) : hasData ? (
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
                                tickFormatter={(value: number) => fmt(value)}
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
                                formatter={(value: number, key) => [
                                    fmt(value),
                                    key === "value" ? currentLabel : (compareLabel ?? ""),
                                ]}
                            />
                            {showCompare && compareLabel !== undefined && (
                                <Legend
                                    wrapperStyle={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}
                                    formatter={(key) => (key === "value" ? currentLabel : compareLabel)}
                                />
                            )}
                            <Line type="monotone" dataKey="value" stroke="hsl(var(--chart-1))" strokeWidth={2.5} dot={false} />
                            {showCompare && (
                                <Line
                                    type="monotone"
                                    dataKey="compare"
                                    stroke="hsl(var(--muted-foreground))"
                                    strokeWidth={2}
                                    strokeDasharray="4 4"
                                    dot={false}
                                />
                            )}
                        </LineChart>
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
