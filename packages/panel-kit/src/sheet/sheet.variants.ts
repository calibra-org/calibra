import { tv, type VariantProps } from "tailwind-variants";

export type SheetSide = "start" | "end" | "top" | "bottom";

/**
 * Sheet variants. `side` is logical (`start` / `end` flip per RTL); the data-state transforms
 * are scoped so the popup slides in from the matching edge. `left` / `right` are kept as
 * physical aliases for shadcn-compat call sites.
 */
export const sheetContent = tv({
    base: "fixed z-50 flex min-h-0 flex-col bg-card text-card-foreground shadow-2xl outline-none transition-transform duration-300 ease-out motion-reduce:transition-none",
    variants: {
        side: {
            end: [
                "inset-y-0 end-0 h-full w-full max-w-md",
                "border-0 [border-inline-start-width:1px]",
                "data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full",
                "rtl:data-[ending-style]:-translate-x-full rtl:data-[starting-style]:-translate-x-full",
            ].join(" "),
            start: [
                "inset-y-0 start-0 h-full w-full max-w-md",
                "border-0 [border-inline-end-width:1px]",
                "data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full",
                "rtl:data-[ending-style]:translate-x-full rtl:data-[starting-style]:translate-x-full",
            ].join(" "),
            top: "inset-x-0 top-0 max-h-[90dvh] border-b data-[ending-style]:-translate-y-full data-[starting-style]:-translate-y-full",
            bottom: "inset-x-0 bottom-0 max-h-[90dvh] border-t data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full",
        },
    },
    defaultVariants: { side: "end" },
});

export type SheetContentVariants = VariantProps<typeof sheetContent>;
