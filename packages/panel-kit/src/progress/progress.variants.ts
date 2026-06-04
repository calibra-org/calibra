import { tv, type VariantProps } from "tailwind-variants";

/** Progress bar indicator tones. Maps to semantic accent utilities — no raw colour names. */
export const progressIndicator = tv({
    base: "h-full rounded-full transition-all duration-300 motion-reduce:transition-none",
    variants: {
        tone: {
            primary: "bg-primary",
            success: "bg-success",
            warning: "bg-warning",
            danger: "bg-danger",
            info: "bg-info",
        },
    },
    defaultVariants: { tone: "primary" },
});

export type ProgressIndicatorVariants = VariantProps<typeof progressIndicator>;
