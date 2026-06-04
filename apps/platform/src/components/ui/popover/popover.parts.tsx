"use client";

import { Popover as BasePopover } from "@base-ui/react/popover";
import type { ComponentProps } from "react";

import { cn } from "#/lib/utils";

export function PopoverRoot(props: ComponentProps<typeof BasePopover.Root>) {
    return <BasePopover.Root data-slot="popover-root" {...props} />;
}
PopoverRoot.displayName = "PopoverRoot";

export function PopoverTrigger(props: ComponentProps<typeof BasePopover.Trigger>) {
    return <BasePopover.Trigger data-slot="popover-trigger" {...props} />;
}
PopoverTrigger.displayName = "PopoverTrigger";

export interface PopoverContentProps extends ComponentProps<typeof BasePopover.Popup> {
    sideOffset?: number;
    align?: "start" | "end" | "center";
    side?: "top" | "right" | "bottom" | "left";
    /**
     * Pixels of breathing room to keep between the popup and the viewport edge — Base UI uses
     * this for collision detection so the popup flips / shifts to stay on-screen. Default 8px
     * works for most surfaces; bump it when the trigger sits inside a busy container like a Sheet.
     */
    collisionPadding?: number;
}

/**
 * Floating popup surface. Wraps Base UI's `Portal` + `Positioner` + `Popup` so callers stay one
 * component away from floating-ui plumbing. Animation matches Dropdown / Select / HoverCard so
 * every floating surface in the app reads the same.
 */
export function PopoverContent({
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
PopoverContent.displayName = "PopoverContent";

export function PopoverClose(props: ComponentProps<typeof BasePopover.Close>) {
    return <BasePopover.Close data-slot="popover-close" {...props} />;
}
PopoverClose.displayName = "PopoverClose";
