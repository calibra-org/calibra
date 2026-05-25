"use client";

import type { ReactNode } from "react";

import { cn } from "#/lib/utils";

interface PeriodButtonProps {
    onClick: () => void;
    selected: boolean;
    /** True for the "current period" indicator (this month / this quarter / this year / today). */
    isCurrent: boolean;
    disabled?: boolean;
    children: ReactNode;
    ariaLabel: string;
    /** Tightness control — Year list rows are taller than Month/Quarter cells. */
    size?: "default" | "row";
}

/**
 * Shared cell for Year / Month / Quarter / Half-year grids. The Day grid uses react-day-picker's
 * own button rendering since it's wired into the calendar grid's accessibility tree.
 */
export function PeriodButton({
    onClick,
    selected,
    isCurrent,
    disabled = false,
    children,
    ariaLabel,
    size = "default",
}: PeriodButtonProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={ariaLabel}
            aria-pressed={selected}
            className={cn(
                "w-full rounded-md border text-sm outline-none transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 motion-reduce:transition-none",
                size === "default" ? "py-2.5" : "py-2.5",
                disabled && "cursor-not-allowed text-muted-foreground/30",
                !disabled && !selected && "border-transparent text-foreground hover:bg-primary/10",
                !disabled && selected && "border-transparent bg-primary text-primary-foreground",
                !disabled && !selected && isCurrent && "ring-1 ring-foreground/30 ring-inset",
            )}
        >
            {children}
        </button>
    );
}
