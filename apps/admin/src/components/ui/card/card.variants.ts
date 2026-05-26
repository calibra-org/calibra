import { tv } from "tailwind-variants";

/**
 * Card slots. Each slot is a callable that returns the resolved className for that part; pass
 * `{ class: callerClass }` to merge a caller override on top.
 */
export const card = tv({
    slots: {
        root: "flex flex-col gap-6 rounded-xl border border-border bg-card py-6 text-card-foreground shadow-sm",
        header: "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-[data-slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        title: "font-semibold leading-none",
        description: "text-muted-foreground text-sm",
        action: "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        body: "px-6",
        footer: "flex items-center px-6 [.border-t]:pt-6",
    },
    variants: {
        tone: {
            default: {},
            success: { root: "border-success/40", title: "text-success" },
            warning: { root: "border-warning/40", title: "text-warning" },
            danger: { root: "border-danger/40", title: "text-danger" },
            info: { root: "border-info/40", title: "text-info" },
        },
    },
    defaultVariants: { tone: "default" },
});
