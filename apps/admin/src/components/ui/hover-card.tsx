import { PreviewCard as BasePreviewCard } from "@base-ui/react/preview-card";
import type * as React from "react";

import { cn } from "#/lib/utils";

function HoverCard(props: React.ComponentProps<typeof BasePreviewCard.Root>) {
    return <BasePreviewCard.Root {...props} />;
}

function HoverCardTrigger(props: React.ComponentProps<typeof BasePreviewCard.Trigger>) {
    return <BasePreviewCard.Trigger {...props} />;
}

interface HoverCardContentProps extends React.ComponentProps<typeof BasePreviewCard.Popup> {
    sideOffset?: number;
    align?: "start" | "end" | "center";
}

/** Hover-only floating card for inline previews (e.g. truncated tag lists). */
function HoverCardContent({ className, sideOffset = 6, align = "center", ...props }: HoverCardContentProps) {
    return (
        <BasePreviewCard.Portal>
            <BasePreviewCard.Positioner sideOffset={sideOffset} align={align} className="z-50">
                <BasePreviewCard.Popup
                    data-slot="hover-card-content"
                    className={cn(
                        "min-w-56 rounded-md border border-border bg-popover p-3 text-popover-foreground text-sm shadow-md outline-none",
                        "data-[ending-style]:translate-y-1 data-[starting-style]:translate-y-1 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
                        "transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none",
                        className,
                    )}
                    {...props}
                />
            </BasePreviewCard.Positioner>
        </BasePreviewCard.Portal>
    );
}

export { HoverCard, HoverCardContent, HoverCardTrigger };
