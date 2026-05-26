import type { Transition, Variants } from "motion/react";

/**
 * Shared `motion` variants + transitions for the regional insights widget. Centralised so the
 * country↔province swap, side-panel slide-in, top-products stagger, and KPI count-up all feel
 * like the same product surface.
 */

export const FAST_SPRING: Transition = {
    type: "spring",
    stiffness: 280,
    damping: 30,
};

export const SLOW_SPRING: Transition = {
    type: "spring",
    stiffness: 140,
    damping: 24,
};

export const TOOLTIP_SPRING: Transition = {
    type: "spring",
    stiffness: 700,
    damping: 40,
    mass: 0.6,
};

export const COUNT_UP_SPRING: Transition = {
    type: "spring",
    stiffness: 120,
    damping: 24,
    mass: 0.8,
};

/** Container for staggered children (top products list, cities list). */
export const listVariants: Variants = {
    hidden: {},
    show: {
        transition: { staggerChildren: 0.04, delayChildren: 0.08 },
    },
};

/** Individual list item — pairs with `listVariants` above. */
export const itemVariants: Variants = {
    hidden: { opacity: 0, y: 6 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 320, damping: 26 } },
};

/** Crossfade for the SVG swap inside `<AnimatePresence mode="wait">`. */
export const svgVariants: Variants = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
};

export const SVG_CROSSFADE_DURATION = 0.18;
