"use client";

import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import { cn } from "@calibra/shared";
import type { ComponentProps } from "react";

export function TooltipProvider(props: ComponentProps<typeof BaseTooltip.Provider>) {
    return <BaseTooltip.Provider delay={150} {...props} />;
}
TooltipProvider.displayName = "TooltipProvider";

export function Tooltip(props: ComponentProps<typeof BaseTooltip.Root>) {
    return <BaseTooltip.Root {...props} />;
}
Tooltip.displayName = "Tooltip";

export function TooltipTrigger(props: ComponentProps<typeof BaseTooltip.Trigger>) {
    return <BaseTooltip.Trigger {...props} />;
}
TooltipTrigger.displayName = "TooltipTrigger";

export function TooltipContent({
    className,
    sideOffset = 6,
    children,
    ...props
}: ComponentProps<typeof BaseTooltip.Popup> & { sideOffset?: number }) {
    return (
        <BaseTooltip.Portal>
            <BaseTooltip.Positioner sideOffset={sideOffset}>
                <BaseTooltip.Popup
                    data-slot="tooltip-content"
                    className={cn(
                        "z-50 rounded-md bg-foreground px-2 py-1 text-background text-xs shadow-md",
                        "data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
                        "transition-[opacity,transform] duration-100 motion-reduce:transition-none",
                        className,
                    )}
                    {...props}
                >
                    {children}
                </BaseTooltip.Popup>
            </BaseTooltip.Positioner>
        </BaseTooltip.Portal>
    );
}
TooltipContent.displayName = "TooltipContent";
