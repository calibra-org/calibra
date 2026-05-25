"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { toPersianDigits } from "@calibra/shared/digits";

import { getDateLib } from "../date-lib";
import type { Calendar } from "../types";

interface GridContainerProps {
    calendar: Calendar;
    locale: "fa" | "en";
    /** Year that should be centered on initial mount (typically the selected year or today's). */
    initialYear: number;
    /** Hard floor; the grid refuses to lazy-expand past this. Defaults to today − 100. */
    minYear?: number;
    /** Hard ceiling. Defaults to today + 100. */
    maxYear?: number;
    /** Years rendered on first paint. Defaults to 21 (initialYear ± 10). */
    initialSpan?: number;
    /** Renders the per-year body — the consumer decides whether it's a Month / Quarter / Half / Year list. */
    renderYear: (year: number) => ReactNode;
    /** Optional ARIA label for the scrollable region. */
    ariaLabel?: string;
    /** Year list rows are their own row already; suppress the sticky header to avoid duplication. */
    hideYearHeader?: boolean;
}

/**
 * Scrollable container that lazy-renders adjacent years as the user nears the top or bottom edge.
 * Stays under the configured hard min/max so the year list feels infinite without actually
 * mounting hundreds of buttons.
 *
 * Used by Month / Quarter / Half-year / Year grids — each renders its own per-year body.
 */
export function GridContainer({
    calendar,
    locale,
    initialYear,
    minYear,
    maxYear,
    initialSpan = 21,
    renderYear,
    ariaLabel,
    hideYearHeader = false,
}: GridContainerProps) {
    const lib = getDateLib(calendar);
    const todayYear = lib.getYear(lib.today());
    const floor = minYear ?? todayYear - 100;
    const ceiling = maxYear ?? todayYear + 100;
    const halfSpan = Math.floor(initialSpan / 2);

    const [windowStart, setWindowStart] = useState(() => Math.max(floor, initialYear - halfSpan));
    const [windowEnd, setWindowEnd] = useState(() => Math.min(ceiling, initialYear + halfSpan));

    const scrollRef = useRef<HTMLDivElement | null>(null);
    const topSentinel = useRef<HTMLDivElement | null>(null);
    const bottomSentinel = useRef<HTMLDivElement | null>(null);
    const yearRefs = useRef<Record<number, HTMLDivElement | null>>({});

    const expandUp = useCallback(() => {
        setWindowStart((current) => Math.max(floor, current - 5));
    }, [floor]);

    const expandDown = useCallback(() => {
        setWindowEnd((current) => Math.min(ceiling, current + 5));
    }, [ceiling]);

    useEffect(() => {
        const root = scrollRef.current;
        if (root === null) return;
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) continue;
                    if (entry.target === topSentinel.current) expandUp();
                    if (entry.target === bottomSentinel.current) expandDown();
                }
            },
            { root, rootMargin: "100px 0px" },
        );
        if (topSentinel.current !== null) observer.observe(topSentinel.current);
        if (bottomSentinel.current !== null) observer.observe(bottomSentinel.current);
        return () => observer.disconnect();
    }, [expandUp, expandDown]);

    /** Scroll the initial year into the middle of the viewport once mounted. */
    useEffect(() => {
        const target = yearRefs.current[initialYear];
        if (target === null || target === undefined) return;
        target.scrollIntoView({ block: "center", behavior: "auto" });
    }, [initialYear]);

    const years = useMemo(() => {
        const out: number[] = [];
        for (let y = windowStart; y <= windowEnd; y += 1) out.push(y);
        return out;
    }, [windowEnd, windowStart]);

    const canExpandUp = windowStart > floor;
    const canExpandDown = windowEnd < ceiling;

    return (
        <div
            ref={scrollRef}
            role="region"
            aria-label={ariaLabel}
            className="relative h-80 overflow-y-auto rounded-md border bg-card"
        >
            <div ref={topSentinel} aria-hidden="true" className="h-px" />
            {canExpandUp && (
                <button
                    type="button"
                    onClick={expandUp}
                    className="w-full py-2 text-center text-muted-foreground text-xs hover:bg-muted/50"
                >
                    {locale === "fa" ? "بارگذاری سال‌های قدیمی‌تر" : "Load earlier years"}
                </button>
            )}
            {years.map((year) => (
                <div
                    key={year}
                    ref={(el) => {
                        yearRefs.current[year] = el;
                    }}
                    className="px-2 py-1"
                >
                    {!hideYearHeader && (
                        <div className="sticky top-0 z-10 bg-card/95 px-1 py-1 text-muted-foreground text-xs backdrop-blur">
                            {locale === "fa" ? toPersianDigits(String(year)) : String(year)}
                        </div>
                    )}
                    {renderYear(year)}
                </div>
            ))}
            {canExpandDown && (
                <button
                    type="button"
                    onClick={expandDown}
                    className="w-full py-2 text-center text-muted-foreground text-xs hover:bg-muted/50"
                >
                    {locale === "fa" ? "بارگذاری سال‌های بعدی" : "Load later years"}
                </button>
            )}
            <div ref={bottomSentinel} aria-hidden="true" className="h-px" />
        </div>
    );
}
