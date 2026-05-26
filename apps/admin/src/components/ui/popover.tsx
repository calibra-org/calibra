import { Popover as BasePopover } from "@base-ui/react/popover";
import type * as React from "react";

import { cn } from "#/lib/utils";

function Popover(props: React.ComponentProps<typeof BasePopover.Root>) {
    return <BasePopover.Root {...props} />;
}

function PopoverTrigger(props: React.ComponentProps<typeof BasePopover.Trigger>) {
    return <BasePopover.Trigger {...props} />;
}

interface PopoverContentProps extends React.ComponentProps<typeof BasePopover.Popup> {
    sideOffset?: number;
    align?: "start" | "end" | "center";
    side?: "top" | "right" | "bottom" | "left";
    /**
     * Pixels of breathing room to keep between the popup and the viewport edge — Base UI
     * uses this for collision detection so the popup flips / shifts to stay on-screen.
     * Default 8px works for most surfaces; bump it when the trigger sits inside a busy
     * container like a Sheet.
     */
    collisionPadding?: number;
}

/**
 * Floating popup container for the {@link Popover} primitive. Wraps the Base UI portal +
 * positioner so callers stay one component away from the floating-ui plumbing.
 */
function PopoverContent({
    className,
    sideOffset = 6,
    align = "start",
    side = "bottom",
    collisionPadding = 8,
    ...props
}: PopoverContentProps) {
    return (
        <BasePopover.Portal>
            <BasePopover.Positioner
                sideOffset={sideOffset}
                align={align}
                side={side}
                collisionPadding={collisionPadding}
                className="z-50"
            >
                <BasePopover.Popup
                    data-slot="popover-content"
                    className={cn(
                        "min-w-44 origin-[var(--transform-origin)] rounded-md border border-border bg-popover p-2 text-popover-foreground text-sm shadow-md outline-none",
                        /** Match dropdown-menu / select / hover-card animation so every floating surface in the app reads the same. */
                        "data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
                        "transition-[opacity,scale] duration-150 ease-out motion-reduce:transition-none",
                        className,
                    )}
                    {...props}
                />
            </BasePopover.Positioner>
        </BasePopover.Portal>
    );
}

function PopoverClose(props: React.ComponentProps<typeof BasePopover.Close>) {
    return <BasePopover.Close {...props} />;
}

export { Popover, PopoverClose, PopoverContent, PopoverTrigger };
