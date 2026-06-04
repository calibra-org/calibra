"use client";

import { type ReactNode, useEffect } from "react";

import { cn } from "#/lib/utils";

export interface StickyActionBarProps {
    /** When true, the bar slides up into view from below the viewport edge. */
    open: boolean;
    /** Bar contents — typically a leading label cluster and a trailing button cluster. */
    children: ReactNode;
    /** Optional accessible label for the floating region. Defaults to "Selection actions". */
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
 * Tier-3 floating action surface. Pins to the bottom-center of the viewport, slides up + fades
 * in when `open` flips to true, and stays out of the page's normal flow so the underlying scroll
 * position never jumps when it appears.
 *
 * The bar injects bottom padding onto the page's scroll container (the `<main>` element mounted
 * by the authenticated layout) while open, so the last row of the page's content stays reachable
 * above the floating pill. The padding tweens smoothly via inline `transition`.
 *
 * For the standard "X selected / Cancel / Delete" pattern use {@link BulkSelectionBar} which
 * wraps this with the shared count badge + button cluster.
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
        main.style.transition = "padding-bottom 200ms ease-out";
        main.style.paddingBottom = open ? `${EXTRA_PADDING_REM}rem` : "";
    }, [open]);

    useEffect(() => {
        return () => {
            if (typeof document === "undefined") return;
            const main = document.querySelector(SCROLL_CONTAINER_SELECTOR);
            if (!(main instanceof HTMLElement)) return;
            main.style.paddingBottom = "";
            main.style.transition = "";
        };
    }, []);

    return (
        <div
            data-slot="sticky-action-bar"
            aria-hidden={!open}
            className={cn("pointer-events-none fixed inset-x-0 bottom-0 flex justify-center pb-6", z)}
        >
            <section
                aria-label={ariaLabel}
                data-state={open ? "open" : "closed"}
                className={cn(
                    "transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
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
StickyActionBar.displayName = "StickyActionBar";
