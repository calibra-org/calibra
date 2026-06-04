import { tv, type VariantProps } from "tailwind-variants";

/**
 * Button variants. `variant` chooses the surface shape (filled / outline / ghost / link);
 * `tone` colours the surface (default = primary, plus the semantic status tones); `size`
 * adjusts dimensions. Tones combine with variants through `compoundVariants` so
 * `<Button variant="outline" tone="danger">` gets a danger-coloured outline rather than
 * the default primary one.
 *
 * `destructive` stays as an explicit variant for shadcn-compat call sites; new code should
 * prefer `variant="default" tone="danger"` (or `variant="outline" tone="danger"`).
 */
export const buttonVariants = tv({
    base: [
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium text-sm outline-none",
        "transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "disabled:pointer-events-none disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        "motion-reduce:transition-none",
        "[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
    ],
    variants: {
        variant: {
            default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
            secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
            outline: "border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
            ghost: "hover:bg-accent hover:text-accent-foreground",
            link: "text-primary underline-offset-4 hover:underline",
            destructive:
                "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
        },
        tone: {
            default: "",
            success: "",
            warning: "",
            danger: "",
        },
        size: {
            xs: "h-7 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3.5",
            sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
            md: "h-9 px-4 py-2 has-[>svg]:px-3",
            lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
            icon: "size-9",
        },
    },
    compoundVariants: [
        { variant: "default", tone: "success", class: "bg-success text-success-foreground hover:bg-success/90" },
        { variant: "default", tone: "warning", class: "bg-warning text-warning-foreground hover:bg-warning/90" },
        { variant: "default", tone: "danger", class: "bg-danger text-danger-foreground hover:bg-danger/90" },
        { variant: "outline", tone: "success", class: "border-success text-success hover:bg-success/10 hover:text-success" },
        { variant: "outline", tone: "warning", class: "border-warning text-warning hover:bg-warning/10 hover:text-warning" },
        { variant: "outline", tone: "danger", class: "border-danger text-danger hover:bg-danger/10 hover:text-danger" },
        { variant: "ghost", tone: "success", class: "text-success hover:bg-success/10 hover:text-success" },
        { variant: "ghost", tone: "warning", class: "text-warning hover:bg-warning/10 hover:text-warning" },
        { variant: "ghost", tone: "danger", class: "text-danger hover:bg-danger/10 hover:text-danger" },
        { variant: "link", tone: "success", class: "text-success" },
        { variant: "link", tone: "warning", class: "text-warning" },
        { variant: "link", tone: "danger", class: "text-danger" },
    ],
    defaultVariants: { variant: "default", tone: "default", size: "md" },
});

export type ButtonVariants = VariantProps<typeof buttonVariants>;
