import { Drawer as BaseDrawer } from "@base-ui/react/drawer";
import { X } from "lucide-react";
import type * as React from "react";

import { cn } from "#/lib/utils";

function Sheet(props: React.ComponentProps<typeof BaseDrawer.Root>) {
    return <BaseDrawer.Root {...props} />;
}

function SheetTrigger(props: React.ComponentProps<typeof BaseDrawer.Trigger>) {
    return <BaseDrawer.Trigger {...props} />;
}

function SheetClose(props: React.ComponentProps<typeof BaseDrawer.Close>) {
    return <BaseDrawer.Close {...props} />;
}

type SheetSide = "top" | "right" | "bottom" | "left";

const sideClasses: Record<SheetSide, string> = {
    top: "inset-x-0 top-0 max-h-[90dvh] rounded-b-lg border-b data-[starting-style]:-translate-y-full data-[ending-style]:-translate-y-full",
    right: "inset-y-0 end-0 max-w-md rounded-s-lg border-s data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full rtl:data-[starting-style]:-translate-x-full rtl:data-[ending-style]:-translate-x-full",
    bottom: "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-lg border-t data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full",
    left: "inset-y-0 start-0 max-w-md rounded-e-lg border-e data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full rtl:data-[starting-style]:translate-x-full rtl:data-[ending-style]:translate-x-full",
};

interface SheetContentProps extends React.ComponentProps<typeof BaseDrawer.Popup> {
    side?: SheetSide;
}

/** Edge-anchored sheet built on Base UI's Drawer. Defaults to a bottom sheet for mobile flows. */
function SheetContent({ className, side = "bottom", children, ...props }: SheetContentProps) {
    return (
        <BaseDrawer.Portal>
            <BaseDrawer.Backdrop
                className={cn(
                    "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm",
                    "transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
                )}
            />
            <BaseDrawer.Popup
                data-slot="sheet-content"
                className={cn(
                    "fixed z-50 flex w-full flex-col gap-4 border border-border bg-card p-6 shadow-lg outline-none",
                    "transition-transform duration-250 ease-out",
                    sideClasses[side],
                    className,
                )}
                {...props}
            >
                {children}
                <BaseDrawer.Close
                    className="absolute end-4 top-4 rounded-sm opacity-70 outline-none transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    aria-label="Close"
                >
                    <X className="size-4" aria-hidden="true" />
                </BaseDrawer.Close>
            </BaseDrawer.Popup>
        </BaseDrawer.Portal>
    );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
    return <div data-slot="sheet-header" className={cn("flex flex-col gap-1.5 text-start", className)} {...props} />;
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="sheet-footer"
            className={cn("mt-auto flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
            {...props}
        />
    );
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof BaseDrawer.Title>) {
    return (
        <BaseDrawer.Title data-slot="sheet-title" className={cn("font-semibold text-lg leading-none", className)} {...props} />
    );
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof BaseDrawer.Description>) {
    return (
        <BaseDrawer.Description
            data-slot="sheet-description"
            className={cn("text-muted-foreground text-sm", className)}
            {...props}
        />
    );
}

export { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger };
