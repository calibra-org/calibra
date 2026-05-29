"use client";

import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "#/components/ui/button";
import { DateFilterChip } from "#/components/ui/date-picker";
import { cn } from "#/lib/utils";

import { type CompareMode, type IntervalMode, useAnalyticsParams } from "../lib/use-analytics-params";

interface SegmentOption<T extends string> {
    value: T;
    label: string;
}

function Segmented<T extends string>({
    value,
    options,
    onChange,
}: {
    value: T;
    options: SegmentOption<T>[];
    onChange: (next: T) => void;
}) {
    return (
        <div className="inline-flex h-8 items-center rounded-md border border-input bg-background p-0.5">
            {options.map((opt) => (
                <button
                    key={opt.value}
                    type="button"
                    onClick={() => onChange(opt.value)}
                    className={cn(
                        "inline-flex h-7 items-center rounded-[5px] px-2.5 text-xs transition-colors",
                        value === opt.value
                            ? "bg-accent font-medium text-accent-foreground"
                            : "text-muted-foreground hover:text-foreground",
                    )}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
}

/**
 * Shared analytics toolbar: the existing date-filter chip on the start edge + grouped comparison +
 * interval segmented controls + an icon-only refresh on the end edge. Wraps cleanly on narrower
 * viewports because the trailing group is one flex child (not 4 individual ones). On the Stock
 * report — a current snapshot — the windowed controls are hidden by `showWindow={false}`.
 */
export function AnalyticsToolbar({ showWindow = true }: { showWindow?: boolean }) {
    const t = useTranslations("Analytics");
    const queryClient = useQueryClient();
    const { compare, intervalMode, dateFilterValue, calendar, setDateFilter, setCompare, setInterval } = useAnalyticsParams();

    if (!showWindow) return null;

    const compareOptions: SegmentOption<CompareMode>[] = [
        { value: "none", label: t("compare.none") },
        { value: "previous_period", label: t("compare.previousPeriod") },
        { value: "previous_year", label: t("compare.previousYear") },
    ];
    const intervalOptions: SegmentOption<IntervalMode>[] = [
        { value: "auto", label: t("interval.auto") },
        { value: "day", label: t("interval.day") },
        { value: "week", label: t("interval.week") },
        { value: "month", label: t("interval.month") },
    ];

    return (
        <div className="flex flex-wrap items-center gap-2">
            <DateFilterChip
                fieldLabel={t("dateRange")}
                addLabel={t("dateRange")}
                value={dateFilterValue}
                onChange={setDateFilter}
                locale={calendar === "jalali" ? "fa" : "en"}
                allowedOperators={["within", "in", "before", "after"]}
                allowedGranularities={["day", "month", "quarter", "half_year", "year"]}
            />
            <div className="ms-auto flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground text-xs">{t("compare.label")}</span>
                    <Segmented value={compare} options={compareOptions} onChange={setCompare} />
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground text-xs">{t("interval.label")}</span>
                    <Segmented value={intervalMode} options={intervalOptions} onChange={setInterval} />
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => queryClient.invalidateQueries({ queryKey: ["analytics"] })}
                    aria-label={t("refresh")}
                    title={t("refresh")}
                >
                    <RefreshCw className="size-3.5" aria-hidden="true" />
                </Button>
            </div>
        </div>
    );
}
