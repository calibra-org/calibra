"use client";

import { useEffect, useRef } from "react";

import { cn } from "#/lib/utils";

import type { Granularity } from "../types";

interface GranularityTabsProps {
    granularity: Granularity;
    allowed: Granularity[];
    onChange: (g: Granularity) => void;
    labelFor: (g: Granularity) => string;
    /** Accessible label for the tablist as a whole. */
    groupLabel: string;
}

const ORDER: Granularity[] = ["day", "month", "quarter", "half_year", "year"];

/**
 * Pill-shaped tablist for switching the active period grid. Keyboard support: arrow keys cycle,
 * Home/End jump to the ends — wired through `role="tablist"` + `role="tab"` so the underlying
 * screen-reader behavior is standard.
 */
export function GranularityTabs({ granularity, allowed, onChange, labelFor, groupLabel }: GranularityTabsProps) {
    const ordered = ORDER.filter((g) => allowed.includes(g));
    const refs = useRef<Record<string, HTMLButtonElement | null>>({});

    useEffect(() => {
        const active = refs.current[granularity];
        if (active !== null && active !== undefined && document.activeElement instanceof HTMLElement) {
            const wasInsideTabs = Object.values(refs.current).some((el) => el === document.activeElement);
            if (wasInsideTabs) active.focus();
        }
    }, [granularity]);

    function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, current: Granularity) {
        const index = ordered.indexOf(current);
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
            event.preventDefault();
            const next = ordered[(index + 1) % ordered.length];
            onChange(next);
            return;
        }
        if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
            event.preventDefault();
            const next = ordered[(index - 1 + ordered.length) % ordered.length];
            onChange(next);
            return;
        }
        if (event.key === "Home") {
            event.preventDefault();
            onChange(ordered[0]);
            return;
        }
        if (event.key === "End") {
            event.preventDefault();
            onChange(ordered[ordered.length - 1]);
        }
    }

    return (
        <div role="tablist" aria-label={groupLabel} className="inline-flex items-center gap-1 rounded-md bg-muted/40 p-1">
            {ordered.map((g) => {
                const active = g === granularity;
                return (
                    <button
                        key={g}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        tabIndex={active ? 0 : -1}
                        ref={(el) => {
                            refs.current[g] = el;
                        }}
                        onClick={() => onChange(g)}
                        onKeyDown={(event) => handleKeyDown(event, g)}
                        className={cn(
                            "inline-flex h-8 items-center rounded px-3 text-xs outline-none transition-colors",
                            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 motion-reduce:transition-none",
                            active
                                ? "bg-foreground text-background shadow-xs"
                                : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                        )}
                    >
                        {labelFor(g)}
                    </button>
                );
            })}
        </div>
    );
}
