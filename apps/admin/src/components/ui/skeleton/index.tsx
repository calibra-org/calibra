import type { ComponentProps } from "react";

import { type SkeletonVariants, skeletonVariants } from "./skeleton.variants";

export interface SkeletonProps extends ComponentProps<"div">, SkeletonVariants {}

/**
 * Placeholder block for the loading state. Tier-2 primitive — the canonical "we're fetching, this
 * is where it'll land" affordance for body content of cards, dialogs, sheets, list rows, etc.
 * Defaults to a soft `animate-pulse`; pass `animation="shimmer"` for wide blocks where a uniform
 * pulse reads as static.
 */
export function Skeleton({ animation, className, ...props }: SkeletonProps) {
    return <div data-slot="skeleton" className={skeletonVariants({ animation, class: className })} {...props} />;
}
Skeleton.displayName = "Skeleton";
