"use client";

import type { ReactNode } from "react";

import { cn } from "#/lib/utils";

interface StickyActionBarProps {
    /** When true, the bar slides up into view from below the viewport edge. */
    open: boolean;
    /** Bar contents — typically a leading label cluster and a trailing button cluster. */
    children: ReactNode;
    /**
     * Optional accessible label for the floating region, surfaced to assistive tech. Defaults to
     * "Selection actions" so screen readers announce the bar's purpose when it appears.
     */
    ariaLabel?: string;
    /** Optional className override for the inner pill — the outer positioning shell stays fixed. */
    className?: string;
    /**
     * Tailwind z-class for the floating shell. Defaults to `z-40` — below toasts (`z-[1090]`) and
     * dialog backdrops (`z-50`) so a modal opening over the bar wins the layering fight.
     */
    z?: string;
}

/**
 * Low-level floating action surface. Pins itself to the bottom-center of the viewport, slides
 * up + fades in when `open` flips to true, and stays out of the page's normal flow so the
 * underlying scroll position never jumps when it appears.
 *
 * Two-layer markup:
 *
 *   - Outer `<div>` is `fixed inset-x-0 bottom-0` with `pointer-events-none`, so empty regions
 *     of the bar's vertical band don't block clicks into the page below.
 *   - Inner pill picks up `pointer-events-auto` only when the bar is visible, so a closed bar
 *     can't intercept a stray click during its fade-out.
 *
 * Designed to host whatever the caller passes — for the standard "X selected / Cancel / Delete"
 * pattern use {@link "./bulk-selection-bar".BulkSelectionBar} which wraps this with the shared
 * count badge + button cluster.
 */
export function StickyActionBar({
    open,
    children,
    ariaLabel = "Selection actions",
    className,
    z = "z-40",
}: StickyActionBarProps) {
    return (
        <>
            <div aria-hidden={!open} className={cn("pointer-events-none fixed inset-x-0 bottom-0 flex justify-center pb-6", z)}>
                <section
                    aria-label={ariaLabel}
                    data-state={open ? "open" : "closed"}
                    className={cn(
                        "transition-[opacity,transform] duration-200 ease-out",
                        "data-[state=open]:pointer-events-auto data-[state=open]:translate-y-0 data-[state=open]:opacity-100",
                        "data-[state=closed]:pointer-events-none data-[state=closed]:translate-y-4 data-[state=closed]:opacity-0",
                    )}
                >
                    <div
                        className={cn(
                            "flex items-center gap-3 rounded-full border border-border bg-popover/95 px-3 py-1.5 text-sm shadow-xl backdrop-blur-sm",
                            className,
                        )}
                    >
                        {children}
                    </div>
                </section>
            </div>
            {/**
             * In-flow spacer that reserves vertical space at the end of the section when the bar
             * is open, so the last row of content stays reachable above the floating bar. Place
             * the bar at the END of your section's scrollable content for the padding to land
             * where the user expects.
             */}
            <div aria-hidden="true" className={cn("shrink-0 transition-[height] duration-200 ease-out", open ? "h-20" : "h-0")} />
        </>
    );
}
