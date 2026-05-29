"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale } from "next-intl";
import { parseAsString, parseAsStringEnum, useQueryStates } from "nuqs";
import { useCallback, useMemo } from "react";

import type { Calendar, DateFilterValue } from "#/components/ui/date-picker";
import type { ReportWindow } from "#/lib/queries/analytics";
import { boundsToDateFilterValue, dateFilterValueToTableViewFilter } from "#/lib/table-view/date-adapter";

export type CompareMode = "none" | "previous_period" | "previous_year";
export type IntervalMode = "auto" | "day" | "week" | "month";

/** Default window: month-to-date (first of the current month → now). */
function monthToDate(): { from: string; to: string } {
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { from: from.toISOString().slice(0, 10), to: now.toISOString() };
}

/** Comparison window for the selected mode — same length immediately before, or the same range a year prior. */
function comparisonWindow(fromStr: string, toStr: string, mode: CompareMode): { from: string; to: string } | null {
    if (mode === "none") return null;
    const from = new Date(fromStr);
    const to = new Date(toStr);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
    if (mode === "previous_period") {
        const span = to.getTime() - from.getTime();
        const prevTo = new Date(from.getTime() - 1);
        const prevFrom = new Date(prevTo.getTime() - span);
        return { from: prevFrom.toISOString(), to: prevTo.toISOString() };
    }
    const prevFrom = new Date(from);
    prevFrom.setUTCFullYear(prevFrom.getUTCFullYear() - 1);
    const prevTo = new Date(to);
    prevTo.setUTCFullYear(prevTo.getUTCFullYear() - 1);
    return { from: prevFrom.toISOString(), to: prevTo.toISOString() };
}

export interface AnalyticsParams {
    from: string;
    to: string;
    compare: CompareMode;
    intervalMode: IntervalMode;
    /** Resolved interval (undefined → backend auto-picks). */
    interval?: "day" | "week" | "month";
    calendar: Calendar;
    dateFilterValue: DateFilterValue | null;
    /** The window passed to report hooks, including the resolved comparison bounds. */
    window: ReportWindow;
    setDateFilter: (value: DateFilterValue | null) => void;
    setCompare: (mode: CompareMode) => void;
    setInterval: (mode: IntervalMode) => void;
}

/**
 * Shared analytics toolbar state, persisted in the URL via nuqs so the date range, comparison mode,
 * and chart interval survive navigation between reports and are bookmarkable. The date control is a
 * {@link DateFilterValue} chip; we round-trip it through the TableView date-adapter so the window is
 * always calendar-agnostic Gregorian bounds on the wire.
 */
export function useAnalyticsParams(): AnalyticsParams {
    const locale = useLocale() as Locale;
    const calendar: Calendar = locale === "fa" ? "jalali" : "gregorian";
    const def = useMemo(() => monthToDate(), []);

    const [params, setParams] = useQueryStates({
        from: parseAsString.withDefault(def.from),
        to: parseAsString.withDefault(def.to),
        compare: parseAsStringEnum<CompareMode>(["none", "previous_period", "previous_year"]).withDefault("none"),
        interval: parseAsStringEnum<IntervalMode>(["auto", "day", "week", "month"]).withDefault("auto"),
    });

    const dateFilterValue = useMemo(
        () => boundsToDateFilterValue(params.from, params.to, calendar),
        [params.from, params.to, calendar],
    );

    const setDateFilter = useCallback(
        (value: DateFilterValue | null) => {
            if (value === null) {
                void setParams({ from: def.from, to: def.to });
                return;
            }
            const mapped = dateFilterValueToTableViewFilter("created_at", value);
            if (mapped === null) return;
            if (mapped.op === "between" && Array.isArray(mapped.value)) {
                void setParams({ from: String(mapped.value[0]), to: String(mapped.value[1]) });
            } else if (mapped.op === "gte") {
                void setParams({ from: String(mapped.value), to: def.to });
            } else if (mapped.op === "lte") {
                void setParams({ from: def.from, to: String(mapped.value) });
            }
        },
        [def, setParams],
    );

    const interval = params.interval === "auto" ? undefined : params.interval;
    const compareBounds = useMemo(
        () => comparisonWindow(params.from, params.to, params.compare),
        [params.from, params.to, params.compare],
    );

    const window: ReportWindow = {
        from: params.from,
        to: params.to,
        interval,
        compareFrom: compareBounds?.from,
        compareTo: compareBounds?.to,
    };

    return {
        from: params.from,
        to: params.to,
        compare: params.compare,
        intervalMode: params.interval,
        interval,
        calendar,
        dateFilterValue,
        window,
        setDateFilter,
        setCompare: useCallback((mode: CompareMode) => void setParams({ compare: mode }), [setParams]),
        setInterval: useCallback((mode: IntervalMode) => void setParams({ interval: mode }), [setParams]),
    };
}
