"use client";

import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import type * as React from "react";

import { cn } from "#/lib/utils";

/**
 * Base UI Tabs wrapper with three visual variants:
 *
 *   - `default` — segmented control on a `bg-muted` track; the active tab gets an animated
 *     pill indicator (`<TabsIndicator>`) tinted `bg-background`.
 *   - `line`   — bare tabs on a transparent track; the indicator is a 2px primary underline.
 *   - `ghost`  — bare tabs with `hover:bg-muted/60`; no indicator, just text-colour change.
 *
 * The active tab matches the `value` prop on `<Tabs>`. Picks up `data-active` from Base UI on the
 * active tab + `data-orientation` for vertical/horizontal layouts. `<TabsIndicator>` reads the
 * `--active-tab-{left,top,width,height}` CSS variables that Base UI sets so it tweens between
 * positions automatically.
 */
type TabsVariant = "default" | "line" | "ghost";

interface TabsListProps extends React.ComponentProps<typeof BaseTabs.List> {
    variant?: TabsVariant;
}

interface TabsTriggerProps extends React.ComponentProps<typeof BaseTabs.Tab> {
    variant?: TabsVariant;
}

interface TabsIndicatorProps extends React.ComponentProps<typeof BaseTabs.Indicator> {
    variant?: TabsVariant;
}

function Tabs({ className, ...props }: React.ComponentProps<typeof BaseTabs.Root>) {
    return <BaseTabs.Root data-slot="tabs" className={cn("flex flex-col gap-4", className)} {...props} />;
}

function TabsList({ className, variant = "default", ...props }: TabsListProps) {
    return (
        <BaseTabs.List
            data-slot="tabs-list"
            data-variant={variant}
            className={cn(
                "relative inline-flex w-fit items-center justify-center text-muted-foreground",
                variant === "default" && "min-h-9 gap-1 rounded-lg bg-muted p-1",
                variant === "line" && "-mb-px gap-1 border-border border-b",
                variant === "ghost" && "gap-1",
                className,
            )}
            {...props}
        />
    );
}

function TabsTrigger({ className, variant = "default", ...props }: TabsTriggerProps) {
    return (
        <BaseTabs.Tab
            data-slot="tabs-trigger"
            data-variant={variant}
            className={cn(
                "relative z-10 inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 font-medium text-sm outline-none transition-colors",
                "text-muted-foreground not-[[data-disabled]]:hover:text-foreground",
                "focus-visible:ring-[3px] focus-visible:ring-ring/40",
                "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
                "[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
                variant === "default" && "data-[active]:text-foreground",
                variant === "line" &&
                    "h-10 rounded-none data-[active]:font-semibold data-[active]:text-foreground",
                variant === "ghost" &&
                    "not-[[data-disabled]]:hover:bg-muted/50 data-[active]:bg-transparent data-[active]:text-foreground",
                className,
            )}
            {...props}
        />
    );
}

/**
 * The animated bar/pill that slides between active tabs. Renders only when `variant !== "ghost"`.
 * Position is driven by Base UI's `--active-tab-*` CSS variables; we just style what each variant
 * looks like.
 */
function TabsIndicator({ className, variant = "default", ...props }: TabsIndicatorProps) {
    if (variant === "ghost") return null;
    return (
        <BaseTabs.Indicator
            data-slot="tabs-indicator"
            data-variant={variant}
            className={cn(
                "absolute transition-all duration-200 ease-out",
                "start-[var(--active-tab-left)] w-[var(--active-tab-width)]",
                variant === "default" &&
                    "top-[var(--active-tab-top)] h-[var(--active-tab-height)] rounded-md bg-background shadow-sm",
                variant === "line" && "bottom-[-1px] h-[2px] rounded-t bg-primary",
                className,
            )}
            {...props}
        />
    );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof BaseTabs.Panel>) {
    return <BaseTabs.Panel data-slot="tabs-content" className={cn("flex-1 outline-none", className)} {...props} />;
}

export { Tabs, TabsContent, TabsIndicator, TabsList, TabsTrigger };
