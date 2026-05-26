"use client";

import { toPersianDigits } from "@calibra/shared/digits";

import { getDateLib, getQuarter } from "../date-lib";
import type { Calendar } from "../types";

import { GridContainer } from "./grid-container";
import { PeriodButton } from "./period-button";

interface QuarterGridProps {
    calendar: Calendar;
    locale: "fa" | "en";
    selected: { year: number; quarter: 1 | 2 | 3 | 4 } | null;
    onPick: (year: number, quarter: 1 | 2 | 3 | 4) => void;
    minYear?: number;
    maxYear?: number;
    initialSpan?: number;
    ariaLabel: string;
}

const QUARTERS: readonly (1 | 2 | 3 | 4)[] = [1, 2, 3, 4];

/**
 * Year-sectioned quarter grid. Each row is `Q1 Q2 Q3 Q4` under its year header — the cell label
 * is just the quarter number, the year context comes from the sticky header above it.
 */
export function QuarterGrid({ calendar, locale, selected, onPick, minYear, maxYear, initialSpan, ariaLabel }: QuarterGridProps) {
    const lib = getDateLib(calendar);
    const today = lib.today();
    const todayYear = lib.getYear(today);
    const todayQuarter = getQuarter(today, lib);
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
                <div className="grid grid-cols-4 gap-2 py-1">
                    {QUARTERS.map((q) => {
                        const isSel = selected?.year === year && selected.quarter === q;
                        const isCur = year === todayYear && q === todayQuarter;
                        const label = locale === "fa" ? `فصل ${toPersianDigits(String(q))}` : `Q${q}`;
                        return (
                            <PeriodButton
                                key={q}
                                onClick={() => onPick(year, q)}
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
