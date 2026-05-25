"use client";

import { toPersianDigits } from "@calibra/shared/digits";

import { getDateLib } from "../date-lib";
import type { Calendar } from "../types";

import { GridContainer } from "./grid-container";
import { PeriodButton } from "./period-button";

interface YearListProps {
    calendar: Calendar;
    locale: "fa" | "en";
    /** Currently-selected year (in calendar-native form) or null when nothing is staged. */
    selectedYear: number | null;
    onPick: (year: number) => void;
    minYear?: number;
    maxYear?: number;
    initialSpan?: number;
    ariaLabel: string;
}

/**
 * Flat list of year rows. Each row is full-width and behaves like a single oversized cell —
 * matches the Linear reference where year picking feels like a vertical timeline.
 */
export function YearList({
    calendar,
    locale,
    selectedYear,
    onPick,
    minYear,
    maxYear,
    initialSpan,
    ariaLabel,
}: YearListProps) {
    const lib = getDateLib(calendar);
    const todayYear = lib.getYear(lib.today());
    const initialYear = selectedYear ?? todayYear;

    return (
        <GridContainer
            calendar={calendar}
            locale={locale}
            initialYear={initialYear}
            minYear={minYear}
            maxYear={maxYear}
            initialSpan={initialSpan}
            ariaLabel={ariaLabel}
            hideYearHeader
            renderYear={(year) => (
                <div className="px-1 py-1">
                    <PeriodButton
                        onClick={() => onPick(year)}
                        selected={year === selectedYear}
                        isCurrent={year === todayYear}
                        ariaLabel={String(year)}
                        size="row"
                    >
                        {locale === "fa" ? toPersianDigits(String(year)) : String(year)}
                    </PeriodButton>
                </div>
            )}
        />
    );
}
