import { tv, type VariantProps } from "tailwind-variants";

/** Spinner sizing — kept independent of icon-size utilities so a button-internal spinner can pick its own scale. */
export const spinnerVariants = tv({
    base: "inline-block shrink-0 animate-spin text-current motion-reduce:animate-none",
    variants: {
        size: {
            xs: "size-3",
            sm: "size-3.5",
            md: "size-4",
            lg: "size-5",
            xl: "size-6",
        },
    },
    defaultVariants: { size: "md" },
});

export type SpinnerVariants = VariantProps<typeof spinnerVariants>;
