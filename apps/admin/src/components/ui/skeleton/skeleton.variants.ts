import { tv } from "tailwind-variants";

/**
 * Single shimmer style for every skeleton. The moving highlight lives in `.skeleton-shimmer`
 * (see `styles/globals.css`) as an animated `background-position` sweep, so it composes with any
 * width / height / radius the caller sets. There's no `pulse` variant any more — one consistent
 * loading affordance across the whole app.
 */
export const skeletonVariants = tv({
    base: "skeleton-shimmer rounded-md",
});
