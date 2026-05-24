"use client";

import { type ReactNode, useEffect } from "react";

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

const SCROLL_CONTAINER_SELECTOR = "main";
const EXTRA_PADDING_REM = 5;

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
 * The bar also injects bottom padding onto the page's scroll container (the `<main>` element
 * mounted by the authenticated layout) while open, so the last row of the page's content stays
 * reachable above the floating pill. The padding is applied as an inline style with a smooth
 * `transition`, so growing or shrinking the gap animates in sync with the bar's own slide.
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
    useEffect(() => {
        if (typeof document === "undefined") return;
        const main = document.querySelector(SCROLL_CONTAINER_SELECTOR);
        if (!(main instanceof HTMLElement)) return;

        /**
         * Stamp a transition so the padding tweens smoothly on both grow and shrink. Setting it
         * every run is cheap — assigning the same string is a no-op as far as the browser is
         * concerned. Stamping it inline avoids leaking the rule into globals.css.
         */
        main.style.transition = "padding-bottom 200ms ease-out";
        main.style.paddingBottom = open ? `${EXTRA_PADDING_REM}rem` : "";
    }, [open]);

    useEffect(() => {
        /**
         * Restore the scroll container's padding on unmount so a stale "5rem" doesn't outlive
         * the page that mounted the bar. The effect above's dependency-array runs are idempotent
         * — this one only fires when the bar leaves the tree entirely.
         */
        return () => {
            if (typeof document === "undefined") return;
            const main = document.querySelector(SCROLL_CONTAINER_SELECTOR);
            if (!(main instanceof HTMLElement)) return;
            main.style.paddingBottom = "";
            main.style.transition = "";
        };
    }, []);

    return (
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
    );
}
