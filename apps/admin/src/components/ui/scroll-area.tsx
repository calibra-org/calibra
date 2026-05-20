"use client";

import { ScrollArea as BaseScrollArea } from "@base-ui/react/scroll-area";
import type * as React from "react";

import { cn } from "#/lib/utils";

interface ScrollAreaProps extends React.ComponentProps<typeof BaseScrollArea.Root> {
    /** Render a horizontal scrollbar in addition to the vertical one. Off by default. */
    horizontal?: boolean;
    /**
     * Tailwind class applied to the inner `<Viewport>`. Use this for `max-h-*` constraints, not
     * the root, so the scrollbar tracks the same height as the scrollable content.
     */
    viewportClassName?: string;
}

/**
 * Tame, beautiful scrollable container built on Base UI's ScrollArea. The native browser
 * scrollbar is replaced with a slim 8px track that fades in on hover / while scrolling and
 * fades out otherwise. Vertical only by default; pass `horizontal` to opt into the X bar.
 *
 * @example
 *   <ScrollArea viewportClassName="max-h-[60dvh]">
 *     ...long content
 *   </ScrollArea>
 */
function ScrollArea({ className, viewportClassName, horizontal = false, children, ...props }: ScrollAreaProps) {
    return (
        <BaseScrollArea.Root data-slot="scroll-area" className={cn("relative", className)} {...props}>
            <BaseScrollArea.Viewport
                data-slot="scroll-area-viewport"
                className={cn(
                    "size-full rounded-[inherit] outline-none transition-[color,box-shadow]",
                    "focus-visible:ring-[3px] focus-visible:ring-ring/40",
                    viewportClassName,
                )}
            >
                {children}
            </BaseScrollArea.Viewport>
            <ScrollAreaScrollbar orientation="vertical" />
            {horizontal && <ScrollAreaScrollbar orientation="horizontal" />}
            <BaseScrollArea.Corner className="bg-transparent" />
        </BaseScrollArea.Root>
    );
}

interface ScrollbarProps extends React.ComponentProps<typeof BaseScrollArea.Scrollbar> {
    orientation?: "vertical" | "horizontal";
}

/**
 * Slim auto-hiding scrollbar. Stays invisible at rest, fades in on hover anywhere inside the
 * viewport, and fully opaque while scrolling. The thumb uses `bg-foreground/25` so it reads in
 * both light and dark modes without leaning on a brand colour.
 */
function ScrollAreaScrollbar({ className, orientation = "vertical", ...props }: ScrollbarProps) {
    return (
        <BaseScrollArea.Scrollbar
            data-slot="scroll-area-scrollbar"
            orientation={orientation}
            className={cn(
                "flex touch-none select-none p-[2px] opacity-0 transition-[opacity] delay-300 duration-150 ease-out",
                "data-[hovering]:opacity-100 data-[scrolling]:opacity-100",
                "data-[hovering]:delay-0 data-[scrolling]:delay-0",
                "data-[hovering]:duration-75 data-[scrolling]:duration-75",
                orientation === "vertical" && "h-full w-2",
                orientation === "horizontal" && "h-2 w-full flex-col",
                className,
            )}
            {...props}
        >
            <BaseScrollArea.Thumb
                data-slot="scroll-area-thumb"
                className={cn("relative flex-1 rounded-full bg-foreground/25 transition-colors", "hover:bg-foreground/40")}
            />
        </BaseScrollArea.Scrollbar>
    );
}

export { ScrollArea, ScrollAreaScrollbar };
