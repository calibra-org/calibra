import { tv } from "tailwind-variants";

export type TabsVariant = "default" | "line" | "ghost";

/**
 * Tabs visual variants. `default` is the pill-on-muted-track segmented control with an animated
 * pill indicator; `line` is bare tabs over a full-width bottom border with a 2px primary
 * underline indicator; `ghost` is bare tabs with a hover background and no indicator.
 *
 * Slots resolve to the className strings for each part:
 *   - list      → `<TabsList>` track wrapper
 *   - trigger   → `<TabsTrigger>` tab
 *   - indicator → `<TabsIndicator>` (suppressed entirely for `ghost`)
 */
export const tabs = tv({
    slots: {
        list: "relative inline-flex orientation-vertical:h-fit orientation-horizontal:min-h-9 w-fit orientation-vertical:flex-col items-center justify-center text-muted-foreground",
        trigger: [
            "relative z-10 inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 font-medium text-sm outline-none transition-colors",
            "text-muted-foreground not-[[data-disabled]]:hover:text-foreground",
            "focus-visible:ring-[3px] focus-visible:ring-ring/40",
            "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
            "orientation-vertical:w-full orientation-vertical:justify-start",
            "[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        ].join(" "),
        indicator: [
            "absolute origin-center transition-all duration-200 ease-out",
            "w-[var(--active-tab-width)] [left:var(--active-tab-left)]",
            "rtl:[left:auto] rtl:[right:var(--active-tab-right)]",
        ].join(" "),
    },
    variants: {
        variant: {
            default: {
                list: "gap-1 rounded-lg bg-muted p-1",
                trigger: "data-[active]:text-foreground",
                indicator: "top-[var(--active-tab-top)] h-[var(--active-tab-height)] rounded-md bg-background shadow-sm",
            },
            line: {
                list: "gap-1 rounded-none bg-transparent",
                trigger: "h-10 rounded-none px-3 pb-2 data-[active]:font-semibold data-[active]:text-foreground",
                indicator: "bottom-[-1px] h-[2px] rounded-full bg-foreground",
            },
            ghost: {
                list: "gap-1 rounded-none bg-transparent",
                trigger: "not-[[data-disabled]]:hover:bg-muted/50 data-[active]:bg-transparent data-[active]:text-foreground",
                indicator: "",
            },
        },
    },
    defaultVariants: { variant: "default" },
});
