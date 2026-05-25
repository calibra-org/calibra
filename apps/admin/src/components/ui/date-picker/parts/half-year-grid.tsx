"use client";

import { toPersianDigits } from "@calibra/shared/digits";

import { getDateLib, getHalfYear } from "../date-lib";
import type { Calendar } from "../types";

import { GridContainer } from "./grid-container";
import { PeriodButton } from "./period-button";

interface HalfYearGridProps {
    calendar: Calendar;
    locale: "fa" | "en";
    selected: { year: number; half: 1 | 2 } | null;
    onPick: (year: number, half: 1 | 2) => void;
    minYear?: number;
    maxYear?: number;
    initialSpan?: number;
    ariaLabel: string;
}

const HALVES: readonly (1 | 2)[] = [1, 2];

/**
 * Year-sectioned half-year grid. Two cells per row (H1 / H2) — minimal layout because halves are
 * a coarse-grained period and a 2-column grid maximises target size.
 */
export function HalfYearGrid({
    calendar,
    locale,
    selected,
    onPick,
    minYear,
    maxYear,
    initialSpan,
    ariaLabel,
}: HalfYearGridProps) {
    const lib = getDateLib(calendar);
    const today = lib.today();
    const todayYear = lib.getYear(today);
    const todayHalf = getHalfYear(today, lib);
    const initialYear = selected?.year ?? todayYear;

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
                <div className="grid grid-cols-2 gap-2 py-1">
                    {HALVES.map((h) => {
                        const isSel = selected?.year === year && selected.half === h;
                        const isCur = year === todayYear && h === todayHalf;
                        const label = locale === "fa" ? `H${toPersianDigits(String(h))}` : `H${h}`;
                        return (
                            <PeriodButton
                                key={h}
                                onClick={() => onPick(year, h)}
                                selected={isSel}
                                isCurrent={isCur}
                                ariaLabel={`${label} ${year}`}
                            >
                                {label}
                            </PeriodButton>
                        );
                    })}
                </div>
            )}
        />
    );
}
