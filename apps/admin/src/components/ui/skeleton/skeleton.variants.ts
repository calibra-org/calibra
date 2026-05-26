import { tv, type VariantProps } from "tailwind-variants";

/**
 * Skeleton shimmer variants. `pulse` is the default soft fade; `shimmer` overlays a moving
 * gradient — better for wide blocks where a uniform pulse reads as "nothing's happening".
 */
export const skeletonVariants = tv({
    base: "rounded-md bg-muted motion-reduce:animate-none",
    variants: {
        animation: {
            pulse: "animate-pulse",
            shimmer: [
                "relative overflow-hidden",
                "after:absolute after:inset-0 after:translate-x-[-100%]",
                "after:bg-gradient-to-r after:from-transparent after:via-foreground/5 after:to-transparent",
                "after:animate-[shimmer_1.6s_infinite]",
            ].join(" "),
        },
    },
    defaultVariants: { animation: "pulse" },
});

export type SkeletonVariants = VariantProps<typeof skeletonVariants>;
