import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type * as React from "react";

import { cn } from "#/lib/utils";

function TooltipProvider(props: React.ComponentProps<typeof BaseTooltip.Provider>) {
    return <BaseTooltip.Provider delay={150} {...props} />;
}

function Tooltip(props: React.ComponentProps<typeof BaseTooltip.Root>) {
    return <BaseTooltip.Root {...props} />;
}

function TooltipTrigger(props: React.ComponentProps<typeof BaseTooltip.Trigger>) {
    return <BaseTooltip.Trigger {...props} />;
}

function TooltipContent({ className, sideOffset = 6, children, ...props }: React.ComponentProps<typeof BaseTooltip.Popup> & { sideOffset?: number }) {
    return (
        <BaseTooltip.Portal>
            <BaseTooltip.Positioner sideOffset={sideOffset}>
                <BaseTooltip.Popup
                    data-slot="tooltip-content"
                    className={cn(
                        "z-50 rounded-md bg-foreground px-2 py-1 text-background text-xs shadow-md",
                        "data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
                        "transition-[opacity,transform] duration-100",
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

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
