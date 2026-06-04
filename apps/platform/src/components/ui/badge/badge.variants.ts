import { tv, type VariantProps } from "tailwind-variants";

/**
 * Badge variants. Like {@link buttonVariants} the surface combines `variant` (filled vs outline
 * vs secondary) and `tone` (default vs semantic status). `dot` swaps the badge for a compact
 * coloured pill with a leading dot — useful for status columns in dense tables.
 */
export const badgeVariants = tv({
    base: [
        "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-md border px-2 py-0.5 font-medium text-xs",
        "transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        "[&>svg]:pointer-events-none [&>svg]:size-3",
    ],
    variants: {
        variant: {
            default: "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
            secondary: "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
            outline: "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
            destructive:
                "border-transparent bg-destructive text-destructive-foreground focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90",
        },
        tone: {
            default: "",
            info: "",
            success: "",
            warning: "",
            danger: "",
        },
        dot: {
            true: "gap-1.5 ps-1.5",
            false: "",
        },
    },
    compoundVariants: [
        { variant: "default", tone: "info", class: "bg-info text-info-foreground" },
        { variant: "default", tone: "success", class: "bg-success text-success-foreground" },
        { variant: "default", tone: "warning", class: "bg-warning text-warning-foreground" },
        { variant: "default", tone: "danger", class: "bg-danger text-danger-foreground" },
        { variant: "secondary", tone: "info", class: "bg-info/15 text-info" },
        { variant: "secondary", tone: "success", class: "bg-success/15 text-success" },
        { variant: "secondary", tone: "warning", class: "bg-warning/15 text-warning" },
        { variant: "secondary", tone: "danger", class: "bg-danger/15 text-danger" },
        { variant: "outline", tone: "info", class: "border-info/40 text-info" },
        { variant: "outline", tone: "success", class: "border-success/40 text-success" },
        { variant: "outline", tone: "warning", class: "border-warning/40 text-warning" },
        { variant: "outline", tone: "danger", class: "border-danger/40 text-danger" },
    ],
    defaultVariants: { variant: "default", tone: "default", dot: false },
});

export type BadgeVariants = VariantProps<typeof badgeVariants>;
