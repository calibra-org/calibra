"use client";

import type { Locale } from "@calibra/shared/i18n";
import { RotateCw, Sliders } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "#/components/ui/button";
import {
    DatePickerPopover,
    type DateFilterValue,
    formatDateFilterValue,
} from "#/components/ui/date-picker";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import { Slider } from "#/components/ui/slider";
import { cn } from "#/lib/utils";

import type { HeatmapMetric } from "./heatmap-scale";
import { MetricPillToggle } from "./metric-pill-toggle";

interface RegionalMapHeaderProps {
    metric: HeatmapMetric;
    onMetricChange: (next: HeatmapMetric) => void;
    dateFilter: DateFilterValue | null;
    onDateFilterChange: (next: DateFilterValue | null) => void;
    topX: number;
    onTopXChange: (next: number) => void;
    onRefresh: () => void;
    locale: Locale;
}

/**
 * Card-header controls cluster: metric pill toggle, date picker, top-X slider popover, refresh.
 * The header is a pure render — every piece of state lives in the parent card so the picker /
 * slider don't need to sync with anything else.
 */
export function RegionalMapHeader({
    metric,
    onMetricChange,
    dateFilter,
    onDateFilterChange,
    topX,
    onTopXChange,
    onRefresh,
    locale,
}: RegionalMapHeaderProps) {
    const t = useTranslations("Dashboard.regional");
    const tCommon = useTranslations("Common");
    const [pickerOpen, setPickerOpen] = useState(false);

    const dateLabel = dateFilter === null
        ? tCommon("dateRange") || t("title")
        : formatDateFilterValue(dateFilter, { locale });

    return (
        <div className="flex flex-wrap items-center gap-2">
            <MetricPillToggle value={metric} onChange={onMetricChange} />
            <DatePickerPopover
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                value={dateFilter}
                onChange={onDateFilterChange}
                locale={locale}
                allowedOperators={["within", "in", "before", "after"]}
                allowedGranularities={["day", "month", "quarter", "half_year", "year"]}
                defaultGranularity="month"
                renderTrigger={(props) => (
                    <button
                        {...props}
                        type="button"
                        className={cn(
                            "inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs",
                            "transition-colors hover:bg-accent hover:text-accent-foreground",
                        )}
                    >
                        <span className="truncate">{dateLabel}</span>
                    </button>
                )}
            />
            <Popover>
                <PopoverTrigger
                    render={(props) => (
                        <button
                            {...(props as React.ComponentProps<"button">)}
                            type="button"
                            className={cn(
                                "inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs",
                                "transition-colors hover:bg-accent hover:text-accent-foreground",
                            )}
                        >
                            <Sliders className="size-3.5" aria-hidden="true" />
                            <span>
                                {t("topProductsLabel")}: {topX}
                            </span>
                        </button>
                    )}
                />
                <PopoverContent className="w-64 p-4">
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between text-xs">
                            <span>{t("topProductsLabel")}</span>
                            <span className="font-medium tabular-nums">{topX}</span>
                        </div>
                        <Slider
                            value={[topX]}
                            min={1}
                            max={10}
                            step={1}
                            onValueChange={(values) => onTopXChange(values[0] ?? topX)}
                        />
                    </div>
                </PopoverContent>
            </Popover>
            <Button variant="outline" size="sm" onClick={onRefresh} className="ms-auto gap-1.5">
                <RotateCw className="size-3.5" aria-hidden="true" />
                <span>{tCommon("refresh")}</span>
            </Button>
        </div>
    );
}
