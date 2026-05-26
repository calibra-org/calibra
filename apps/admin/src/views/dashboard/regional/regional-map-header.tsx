"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Sliders } from "lucide-react";
import { useTranslations } from "next-intl";

import { DateFilterChip, type DateFilterValue } from "#/components/ui/date-picker";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import { Slider } from "#/components/ui/slider";
import { cn } from "#/lib/utils";

import { MetricPillToggle } from "./metric-pill-toggle";
import type { HeatmapMetric } from "./heatmap-scale";

interface RegionalMapHeaderProps {
    metric: HeatmapMetric;
    onMetricChange: (next: HeatmapMetric) => void;
    dateFilter: DateFilterValue | null;
    onDateFilterChange: (next: DateFilterValue | null) => void;
    topX: number;
    onTopXChange: (next: number) => void;
    locale: Locale;
}

/**
 * Card-header controls cluster styled like the standard admin toolbar (matches the list pages'
 * `DataTableToolbar`): `h-8` rounded-md elements, dashed border for add-affordances, solid
 * border once a value is set, refresh as a ghost icon button. Wrapped in `flex flex-wrap` so
 * the row collapses cleanly under narrow widths.
 */
export function RegionalMapHeader({
    metric,
    onMetricChange,
    dateFilter,
    onDateFilterChange,
    topX,
    onTopXChange,
    locale,
}: RegionalMapHeaderProps) {
    const t = useTranslations("Dashboard.regional");

    return (
        <div className="flex flex-wrap items-center gap-2">
            <MetricPillToggle value={metric} onChange={onMetricChange} />

            <DateFilterChip
                fieldLabel={t("dateRangeLabel")}
                addLabel={t("dateRangeAddLabel")}
                value={dateFilter}
                onChange={onDateFilterChange}
                locale={locale}
                allowedOperators={["within", "in", "before", "after"]}
                allowedGranularities={["day", "month", "quarter", "half_year", "year"]}
            />

            <Popover>
                <PopoverTrigger
                    render={(props) => (
                        <button
                            {...(props as React.ComponentProps<"button">)}
                            type="button"
                            className={cn(
                                "inline-flex h-8 items-center gap-2 rounded-md border border-input border-solid bg-background px-2.5 text-sm outline-none transition-colors",
                                "hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
                            )}
                        >
                            <Sliders className="size-3.5 text-muted-foreground" aria-hidden="true" />
                            <span>{t("topProductsLabel")}</span>
                            <span className="h-4 w-px bg-border" aria-hidden="true" />
                            <span className="font-medium tabular-nums">{topX}</span>
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
        </div>
    );
}
