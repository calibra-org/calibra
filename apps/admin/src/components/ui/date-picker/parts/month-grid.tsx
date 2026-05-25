"use client";

import { useMemo } from "react";

import { getDateLib } from "../date-lib";
import type { Calendar } from "../types";

import { GridContainer } from "./grid-container";
import { PeriodButton } from "./period-button";

interface MonthGridProps {
    calendar: Calendar;
    locale: "fa" | "en";
    /** `{ year, monthZero }` of the currently-staged month, or null. */
    selected: { year: number; monthZero: number } | null;
    onPick: (year: number, monthZero: number) => void;
    minYear?: number;
    maxYear?: number;
    initialSpan?: number;
    ariaLabel: string;
}

/**
 * Year-sectioned 4×3 month grid. Localised month names come from the active dateLib's `format`
 * (which honours the Jalali locale's Persian names when calendar=jalali).
 */
export function MonthGrid({
    calendar,
    locale,
    selected,
    onPick,
    minYear,
    maxYear,
    initialSpan,
    ariaLabel,
}: MonthGridProps) {
    const lib = getDateLib(calendar);
    const today = lib.today();
    const todayYear = lib.getYear(today);
    const todayMonth = lib.getMonth(today);
    const initialYear = selected?.year ?? todayYear;

    const monthNames = useMemo(() => buildMonthLabels(calendar, lib), [calendar, lib]);

    return (
        <GridContainer
            calendar={calendar}
            locale={locale}
            initialYear={initialYear}
            minYear={minYear}
            maxYear={maxYear}
            initialSpan={initialSpan}
            ariaLabel={ariaLabel}
            renderYear={(year) => (
                <div className="grid grid-cols-4 gap-2 py-1">
                    {monthNames.map((name, monthZero) => {
                        const isSel = selected?.year === year && selected.monthZero === monthZero;
                        const isCur = year === todayYear && monthZero === todayMonth;
                        return (
                            <PeriodButton
                                key={monthZero}
                                onClick={() => onPick(year, monthZero)}
                                selected={isSel}
                                isCurrent={isCur}
                                ariaLabel={`${name} ${year}`}
                            >
                                {name}
                            </PeriodButton>
                        );
                    })}
                </div>
            )}
        />
    );
}

/**
 * Pull all 12 short month labels in one pass by formatting one date per month under the active
 * dateLib. Reads the dateLib's locale, so Jalali → Persian names automatically.
 */
function buildMonthLabels(_calendar: Calendar, lib: ReturnType<typeof getDateLib>): string[] {
    const base = lib.startOfMonth(lib.today());
    return Array.from({ length: 12 }, (_unused, i) => lib.format(lib.setMonth(base, i), "MMM"));
}
