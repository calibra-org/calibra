"use client";

import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type * as React from "react";

import { cn } from "#/lib/utils";

/**
 * Edge-anchored sheet built on Base UI's Dialog primitive. Dialog (not Drawer) means there is no
 * swipe / pointer-drag dismissal — the sheet only closes via the Esc key, the backdrop click, or
 * an explicit close action. The render surface is a `Viewport > Popup` pair so the popup can
 * anchor against a real CSS scroll context, which keeps sticky descendants inside the sheet
 * working correctly.
 *
 * The exported names mirror the shadcn-style API the rest of the admin uses; the visual language
 * is intentionally heavier (full-bleed flush edges, larger 9×9 close button with focus ring,
 * `bg-card` background) so the sheet reads as a workspace column rather than a floating card.
 */

type SheetSide = "start" | "end" | "top" | "bottom";

/** Logical sides — `start`/`end` flip automatically under RTL. `right` / `left` are kept as backwards-compat aliases. */
type SheetSideInput = SheetSide | "left" | "right";

const sideClasses: Record<SheetSide, string> = {
    /** Anchored to the writing-mode end edge. RTL-aware: lives at the left of the viewport in `fa`. */
    end: [
        "inset-y-0 end-0 h-full w-full max-w-md",
        "border-0 [border-inline-start-width:1px]",
        "data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full",
        "rtl:data-[ending-style]:-translate-x-full rtl:data-[starting-style]:-translate-x-full",
    ].join(" "),
    /** Anchored to the writing-mode start edge. */
    start: [
        "inset-y-0 start-0 h-full w-full max-w-md",
        "border-0 [border-inline-end-width:1px]",
        "data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full",
        "rtl:data-[ending-style]:translate-x-full rtl:data-[starting-style]:translate-x-full",
    ].join(" "),
    top: "inset-x-0 top-0 max-h-[90dvh] border-b data-[ending-style]:-translate-y-full data-[starting-style]:-translate-y-full",
    bottom: "inset-x-0 bottom-0 max-h-[90dvh] border-t data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full",
};

function normaliseSide(side: SheetSideInput): SheetSide {
    if (side === "left") return "start";
    if (side === "right") return "end";
    return side;
}

function Sheet(props: React.ComponentProps<typeof SheetPrimitive.Root>) {
    return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger(props: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
    return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose(props: React.ComponentProps<typeof SheetPrimitive.Close>) {
    return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

interface SheetContentProps extends React.ComponentProps<typeof SheetPrimitive.Popup> {
    side?: SheetSideInput;
    /** Render the built-in 9×9 close button (top-end, ring-focused). Defaults to `true`. */
    withCloseButton?: boolean;
    /**
     * Backwards-compat alias for `withCloseButton={false}` — the original Drawer-based API used
     * `hideCloseButton`, so existing call sites stay valid while the API converges.
     */
    hideCloseButton?: boolean;
}

function SheetContent({
    className,
    side = "bottom",
    withCloseButton = true,
    hideCloseButton,
    children,
    ...props
}: SheetContentProps) {
    const resolvedSide = normaliseSide(side);
    const showClose = withCloseButton && hideCloseButton !== true;
    return (
        <SheetPrimitive.Portal>
            <SheetPrimitive.Backdrop
                className={cn(
                    "fixed inset-0 z-50 bg-black/70 backdrop-blur-sm",
                    "transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
                )}
            />
            <SheetPrimitive.Viewport className="fixed inset-0 z-50">
                <SheetPrimitive.Popup
                    data-slot="sheet-content"
                    className={cn(
                        "fixed z-50 flex min-h-0 flex-col bg-card text-card-foreground shadow-2xl outline-none",
                        "transition-transform duration-300 ease-out",
                        sideClasses[resolvedSide],
                        className,
                    )}
                    {...props}
                >
                    {children}
                    {showClose && (
                        <SheetPrimitive.Close
                            aria-label="Close"
                            className={cn(
                                "absolute end-4 top-4 inline-flex size-9 items-center justify-center rounded-md",
                                "border border-transparent bg-transparent text-muted-foreground",
                                "transition-colors hover:bg-muted hover:text-foreground",
                                "outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40",
                                "disabled:pointer-events-none disabled:opacity-50",
                            )}
                        >
                            <X className="size-5" aria-hidden="true" />
                            <span className="sr-only">Close</span>
                        </SheetPrimitive.Close>
                    )}
                </SheetPrimitive.Popup>
            </SheetPrimitive.Viewport>
        </SheetPrimitive.Portal>
    );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
    return <div data-slot="sheet-header" className={cn("flex flex-col gap-1.5 p-4 text-start", className)} {...props} />;
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="sheet-footer"
            className={cn("mt-auto flex flex-col gap-2 p-4 sm:flex-row sm:justify-end", className)}
            {...props}
        />
    );
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
    return (
        <SheetPrimitive.Title
            data-slot="sheet-title"
            className={cn("font-semibold text-foreground text-lg leading-none tracking-tight", className)}
            {...props}
        />
    );
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Description>) {
    return (
        <SheetPrimitive.Description
            data-slot="sheet-description"
            className={cn("text-muted-foreground text-sm", className)}
            {...props}
        />
    );
}

export { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger };
