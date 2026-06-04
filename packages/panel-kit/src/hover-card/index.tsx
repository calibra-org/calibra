"use client";

import { PreviewCard as BasePreviewCard } from "@base-ui/react/preview-card";
import { cn } from "@calibra/shared";
import type { ComponentProps } from "react";

export function HoverCard(props: ComponentProps<typeof BasePreviewCard.Root>) {
    return <BasePreviewCard.Root {...props} />;
}
HoverCard.displayName = "HoverCard";

export function HoverCardTrigger(props: ComponentProps<typeof BasePreviewCard.Trigger>) {
    return <BasePreviewCard.Trigger {...props} />;
}
HoverCardTrigger.displayName = "HoverCardTrigger";

export interface HoverCardContentProps extends ComponentProps<typeof BasePreviewCard.Popup> {
    sideOffset?: number;
    align?: "start" | "end" | "center";
}

/** Hover-only floating card for inline previews (e.g. truncated tag lists, image thumbnails). */
export function HoverCardContent({ className, sideOffset = 6, align = "center", ...props }: HoverCardContentProps) {
    return (
        <BasePreviewCard.Portal>
            <BasePreviewCard.Positioner sideOffset={sideOffset} align={align} className="z-50">
                <BasePreviewCard.Popup
                    data-slot="hover-card-content"
                    className={cn(
                        "min-w-56 origin-[var(--transform-origin)] rounded-md border border-border bg-popover p-3 text-popover-foreground text-sm shadow-md outline-none",
                        "data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
                        "transition-[opacity,scale] duration-150 ease-out motion-reduce:transition-none",
                        className,
                    )}
                    {...props}
                />
            </BasePreviewCard.Positioner>
        </BasePreviewCard.Portal>
    );
}
HoverCardContent.displayName = "HoverCardContent";
