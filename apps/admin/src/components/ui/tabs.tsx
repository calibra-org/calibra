"use client";

import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import { createContext, useContext } from "react";
import type * as React from "react";

import { cn } from "#/lib/utils";

/**
 * Visual variants for the {@link Tabs} primitive:
 *
 *   - `default` — segmented control on a `bg-muted` track; the active tab gets an animated pill
 *     indicator (`bg-background` + shadow) that slides between selections.
 *   - `line`    — bare tabs over an always-on full-width bottom border; the indicator is a 2px
 *     primary underline that animates between active tabs. Border is rendered on the wrapper so
 *     it extends edge-to-edge even when the list itself is content-sized.
 *   - `ghost`   — bare tabs with `hover:bg-muted/50`; no indicator, plain text-colour change.
 *
 * The indicator (rendered automatically inside `<TabsList>` unless `withIndicator={false}`) reads
 * the `--active-tab-{left,top,width,height}` CSS variables Base UI sets, so it tweens between
 * positions and sizes whenever the active tab changes — no manual measurement needed.
 */
type TabsVariant = "default" | "line" | "ghost";

interface TabsAppearance {
    variant?: TabsVariant;
}

const TabsAppearanceContext = createContext<TabsAppearance>({});

function useTabsVariant(local?: TabsVariant): TabsVariant {
    const ctx = useContext(TabsAppearanceContext);
    return local ?? ctx.variant ?? "default";
}

interface TabsRootProps extends React.ComponentProps<typeof BaseTabs.Root> {
    variant?: TabsVariant;
}

function Tabs({ variant = "default", className, children, ...props }: TabsRootProps) {
    return (
        <TabsAppearanceContext.Provider value={{ variant }}>
            <BaseTabs.Root data-slot="tabs" className={cn("flex flex-col gap-4", className)} {...props}>
                {children}
            </BaseTabs.Root>
        </TabsAppearanceContext.Provider>
    );
}

interface TabsListProps extends React.ComponentProps<typeof BaseTabs.List> {
    variant?: TabsVariant;
    /** Render the {@link TabsIndicator} as a child of the list. Defaults to `true`. */
    withIndicator?: boolean;
    /**
     * When truthy, wrap the list in a full-width bottom-border div so the divider extends
     * edge-to-edge. Defaults to `true` for the `line` variant, `false` otherwise. Pass an
     * object to customize the wrapper className.
     */
    withBorder?: boolean | { className?: string };
    /** Extra props to forward to the auto-rendered indicator. */
    indicatorProps?: Omit<React.ComponentProps<typeof BaseTabs.Indicator>, "variant"> & { variant?: TabsVariant };
}

function TabsList({
    className,
    variant: variantProp,
    withIndicator = true,
    withBorder: withBorderProp,
    indicatorProps,
    children,
    ...props
}: TabsListProps) {
    const variant = useTabsVariant(variantProp);
    const isLine = variant === "line";
    const resolvedBorder = withBorderProp ?? isLine;
    const showBorder = resolvedBorder !== false;
    const borderClassName = typeof resolvedBorder === "object" ? resolvedBorder.className : undefined;

    const list = (
        <BaseTabs.List
            data-slot="tabs-list"
            data-variant={variant}
            className={cn(
                "relative inline-flex w-fit items-center justify-center text-muted-foreground",
                "orientation-vertical:h-fit orientation-vertical:flex-col",
                "orientation-horizontal:min-h-9",
                variant === "default" && "gap-1 rounded-lg bg-muted p-1",
                variant === "line" && "gap-1 rounded-none bg-transparent",
                variant === "ghost" && "gap-1 rounded-none bg-transparent",
                className,
            )}
            {...props}
        >
            {children}
            {withIndicator && <TabsIndicator {...indicatorProps} variant={indicatorProps?.variant ?? variant} />}
        </BaseTabs.List>
    );

    if (!showBorder) return list;
    return <div className={cn("w-full border-border border-b", borderClassName)}>{list}</div>;
}

interface TabsTriggerProps extends React.ComponentProps<typeof BaseTabs.Tab> {
    variant?: TabsVariant;
}

function TabsTrigger({ className, variant: variantProp, ...props }: TabsTriggerProps) {
    const variant = useTabsVariant(variantProp);
    const isLine = variant === "line";
    return (
        <BaseTabs.Tab
            data-slot="tabs-trigger"
            data-variant={variant}
            className={cn(
                "relative z-10 inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 font-medium text-sm outline-none transition-colors",
                "text-muted-foreground not-[[data-disabled]]:hover:text-foreground",
                "focus-visible:ring-[3px] focus-visible:ring-ring/40",
                "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
                "orientation-vertical:w-full orientation-vertical:justify-start",
                "[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
                variant === "default" && "data-[active]:text-foreground",
                isLine && "h-10 rounded-none px-3 pb-2 data-[active]:font-semibold data-[active]:text-foreground",
                variant === "ghost" &&
                    "not-[[data-disabled]]:hover:bg-muted/50 data-[active]:bg-transparent data-[active]:text-foreground",
                className,
            )}
            {...props}
        />
    );
}

interface TabsIndicatorProps extends React.ComponentProps<typeof BaseTabs.Indicator> {
    variant?: TabsVariant;
}

function TabsIndicator({ className, variant: variantProp, ...props }: TabsIndicatorProps) {
    const variant = useTabsVariant(variantProp);
    if (variant === "ghost") return null;
    return (
        <BaseTabs.Indicator
            data-slot="tabs-indicator"
            data-variant={variant}
            className={cn(
                "absolute origin-center transition-all duration-200 ease-out",
                "start-[var(--active-tab-left)] w-[var(--active-tab-width)]",
                "rtl:end-[var(--active-tab-right)] rtl:start-auto",
                variant === "default" &&
                    "top-[var(--active-tab-top)] h-[var(--active-tab-height)] rounded-md bg-background shadow-sm",
                variant === "line" && "bottom-[-1px] h-[2px] rounded-full bg-primary",
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
