import type { ComponentProps } from "react";

import { skeletonVariants } from "./skeleton.variants";

export interface SkeletonProps extends ComponentProps<"div"> {}

/**
 * Placeholder block for the loading state. Tier-2 primitive — the canonical "we're fetching, this
 * is where it'll land" affordance for body content of cards, dialogs, sheets, list rows, etc. One
 * shimmer style everywhere; size + radius it via `className` to mirror the value it stands in for
 * so the layout doesn't reflow when data lands.
 */
export function Skeleton({ className, ...props }: SkeletonProps) {
    return <div data-slot="skeleton" className={skeletonVariants({ class: className })} {...props} />;
}
Skeleton.displayName = "Skeleton";
