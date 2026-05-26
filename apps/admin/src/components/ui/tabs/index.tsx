"use client";

import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import { type ComponentProps, createContext, useContext } from "react";

import { cn } from "#/lib/utils";

import { type TabsVariant, tabs } from "./tabs.variants";

const TabsAppearanceContext = createContext<{ variant?: TabsVariant }>({});

function useTabsVariant(local?: TabsVariant): TabsVariant {
    const ctx = useContext(TabsAppearanceContext);
    return local ?? ctx.variant ?? "default";
}

export interface TabsRootProps extends ComponentProps<typeof BaseTabs.Root> {
    variant?: TabsVariant;
}

/**
 * Tier-2 tabs. Visual variants:
 *  - `default` (segmented pill on a muted track; animated pill indicator)
 *  - `line` (bare tabs over a full-width bottom border; 2px primary underline indicator)
 *  - `ghost` (bare tabs with hover background; no indicator)
 *
 * The indicator (auto-rendered inside `<TabsList>` unless `withIndicator={false}`) reads the
 * `--active-tab-{left,top,width,height}` CSS variables Base UI sets, so it tweens between
 * positions and sizes whenever the active tab changes — no manual measurement needed.
 */
export function Tabs({ variant = "default", className, children, ...props }: TabsRootProps) {
    return (
        <TabsAppearanceContext.Provider value={{ variant }}>
            <BaseTabs.Root data-slot="tabs" className={cn("flex flex-col gap-4", className)} {...props}>
                {children}
            </BaseTabs.Root>
        </TabsAppearanceContext.Provider>
    );
}
Tabs.displayName = "Tabs";

export interface TabsListProps extends ComponentProps<typeof BaseTabs.List> {
    variant?: TabsVariant;
    /** Render the {@link TabsIndicator} as a child of the list. Defaults to `true`. */
    withIndicator?: boolean;
    /**
     * When truthy, wrap the list in a full-width bottom-border div so the divider extends
     * edge-to-edge. Defaults to `true` for the `line` variant, `false` otherwise.
     */
    withBorder?: boolean | { className?: string };
    /** Extra props to forward to the auto-rendered indicator. */
    indicatorProps?: Omit<ComponentProps<typeof BaseTabs.Indicator>, "variant"> & { variant?: TabsVariant };
}

export function TabsList({
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
            className={cn(tabs({ variant }).list(), className)}
            {...props}
        >
            {children}
            {withIndicator && <TabsIndicator {...indicatorProps} variant={indicatorProps?.variant ?? variant} />}
        </BaseTabs.List>
    );

    if (!showBorder) return list;
    return <div className={cn("w-full border-border border-b", borderClassName)}>{list}</div>;
}
TabsList.displayName = "TabsList";

export interface TabsTriggerProps extends ComponentProps<typeof BaseTabs.Tab> {
    variant?: TabsVariant;
}

export function TabsTrigger({ className, variant: variantProp, ...props }: TabsTriggerProps) {
    const variant = useTabsVariant(variantProp);
    return (
        <BaseTabs.Tab
            data-slot="tabs-trigger"
            data-variant={variant}
            className={cn(tabs({ variant }).trigger(), className)}
            {...props}
        />
    );
}
TabsTrigger.displayName = "TabsTrigger";

export interface TabsIndicatorProps extends ComponentProps<typeof BaseTabs.Indicator> {
    variant?: TabsVariant;
}

export function TabsIndicator({ className, variant: variantProp, ...props }: TabsIndicatorProps) {
    const variant = useTabsVariant(variantProp);
    if (variant === "ghost") return null;
    return (
        <BaseTabs.Indicator
            data-slot="tabs-indicator"
            data-variant={variant}
            className={cn(tabs({ variant }).indicator(), className)}
            {...props}
        />
    );
}
TabsIndicator.displayName = "TabsIndicator";

export function TabsContent({ className, ...props }: ComponentProps<typeof BaseTabs.Panel>) {
    return <BaseTabs.Panel data-slot="tabs-content" className={cn("flex-1 outline-none", className)} {...props} />;
}
TabsContent.displayName = "TabsContent";
