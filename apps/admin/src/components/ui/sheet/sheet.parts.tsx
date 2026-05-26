"use client";

import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import type { ComponentProps, ReactNode } from "react";

import { Skeleton } from "#/components/ui/skeleton";
import { X } from "#/icons";
import { cn } from "#/lib/utils";

import { type SheetSide, sheetContent } from "./sheet.variants";

/** Logical sides — `start`/`end` flip automatically under RTL. `right` / `left` are kept as backwards-compat aliases. */
export type SheetSideInput = SheetSide | "left" | "right";

function normaliseSide(side: SheetSideInput): SheetSide {
    if (side === "left") return "start";
    if (side === "right") return "end";
    return side;
}

export function SheetRoot(props: ComponentProps<typeof SheetPrimitive.Root>) {
    return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}
SheetRoot.displayName = "SheetRoot";

export function SheetTrigger(props: ComponentProps<typeof SheetPrimitive.Trigger>) {
    return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}
SheetTrigger.displayName = "SheetTrigger";

export function SheetClose(props: ComponentProps<typeof SheetPrimitive.Close>) {
    return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}
SheetClose.displayName = "SheetClose";

export interface SheetContentProps extends Omit<ComponentProps<typeof SheetPrimitive.Popup>, "className"> {
    /** Restricted to plain strings — Base UI's callable className form is not supported here because `tv()` slots expect a string. */
    className?: string;
    side?: SheetSideInput;
    /** Render the built-in 9×9 close button (top-end, ring-focused). Defaults to `true`. */
    withCloseButton?: boolean;
    /** Backwards-compat alias for `withCloseButton={false}`. */
    hideCloseButton?: boolean;
}

/**
 * Edge-anchored sheet built on Base UI's Dialog primitive. Dialog (not Drawer) means there is no
 * swipe / pointer-drag dismissal — the sheet only closes via the Esc key, the backdrop click, or
 * an explicit close action. The render surface is a `Viewport > Popup` pair so the popup can
 * anchor against a real CSS scroll context, which keeps sticky descendants inside the sheet
 * working correctly.
 *
 * Visual language is intentionally heavier (full-bleed flush edges, larger 9×9 close button with
 * focus ring, `bg-card` background) so the sheet reads as a workspace column rather than a
 * floating card.
 */
export function SheetContent({
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
                    "transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none",
                )}
            />
            <SheetPrimitive.Viewport className="fixed inset-0 z-50">
                <SheetPrimitive.Popup
                    data-slot="sheet-content"
                    className={sheetContent({ side: resolvedSide, class: className })}
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
SheetContent.displayName = "SheetContent";

export function SheetHeader({ className, ...props }: ComponentProps<"div">) {
    return <div data-slot="sheet-header" className={cn("flex flex-col gap-1.5 p-4 text-start", className)} {...props} />;
}
SheetHeader.displayName = "SheetHeader";

export function SheetFooter({ className, ...props }: ComponentProps<"div">) {
    return (
        <div
            data-slot="sheet-footer"
            className={cn("mt-auto flex flex-col gap-2 p-4 sm:flex-row sm:justify-end", className)}
            {...props}
        />
    );
}
SheetFooter.displayName = "SheetFooter";

export function SheetTitle({ className, ...props }: ComponentProps<typeof SheetPrimitive.Title>) {
    return (
        <SheetPrimitive.Title
            data-slot="sheet-title"
            className={cn("font-semibold text-foreground text-lg leading-none tracking-tight", className)}
            {...props}
        />
    );
}
SheetTitle.displayName = "SheetTitle";

export function SheetDescription({ className, ...props }: ComponentProps<typeof SheetPrimitive.Description>) {
    return (
        <SheetPrimitive.Description
            data-slot="sheet-description"
            className={cn("text-muted-foreground text-sm", className)}
            {...props}
        />
    );
}
SheetDescription.displayName = "SheetDescription";

/**
 * Body slot. Pass `isLoading` to render a `Skeleton` block while the sheet's data is still
 * loading — the header + footer keep rendering so the slide-in animation doesn't visibly flash
 * empty content.
 */
export function SheetBody({ className, isLoading, children, ...props }: ComponentProps<"div"> & { isLoading?: boolean }) {
    return (
        <div data-slot="sheet-body" className={cn("min-h-0 flex-1 overflow-auto p-4", className)} {...props}>
            {isLoading ? (
                <div className="space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-32 w-full" animation="shimmer" />
                </div>
            ) : (
                (children as ReactNode)
            )}
        </div>
    );
}
SheetBody.displayName = "SheetBody";
