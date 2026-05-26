"use client";

import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { type ReactNode, useEffect } from "react";

import { TOOLTIP_SPRING } from "./motion-variants";

interface MapTooltipProps {
    /** Pointer screen coordinates from the latest `pointermove`. `null` hides the tooltip. */
    position: { x: number; y: number } | null;
    children: ReactNode;
}

/**
 * Floating tooltip that follows the pointer with a spring. Mounted once per map view; the
 * caller updates `position` from a single `pointermove` listener on the SVG (cheaper than 31
 * portaled tooltips and avoids the inter-path flicker that per-element tooltips show on
 * polygon borders).
 *
 * Respects `prefers-reduced-motion`: when set, the spring is bypassed and position updates
 * jump instantly.
 */
export function MapTooltip({ position, children }: MapTooltipProps) {
    const reduce = useReducedMotion();
    const xRaw = useMotionValue(0);
    const yRaw = useMotionValue(0);
    const x = useSpring(xRaw, reduce ? { duration: 0 } : TOOLTIP_SPRING);
    const y = useSpring(yRaw, reduce ? { duration: 0 } : TOOLTIP_SPRING);

    useEffect(() => {
        if (position === null) return;
        xRaw.set(position.x + 14);
        yRaw.set(position.y + 14);
    }, [position, xRaw, yRaw]);

    return (
        <AnimatePresence>
            {position !== null ? (
                <motion.div
                    key="map-tooltip"
                    style={{ x, y, position: "fixed", top: 0, left: 0, zIndex: 50, pointerEvents: "none" }}
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.12 }}
                    className="rounded-md border bg-popover px-3 py-2 text-popover-foreground text-xs shadow-lg"
                >
                    {children}
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
}
