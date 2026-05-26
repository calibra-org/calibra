"use client";

import type { Locale } from "@calibra/shared/i18n";
import { motion, useReducedMotion } from "motion/react";

import { IRAN_COUNTRY_PROVINCES, IRAN_COUNTRY_VIEWBOX } from "#/vendor/iran-map";

import { ZERO_COLOR } from "./heatmap-scale";
import { ProvinceLabels } from "./province-labels";
import { SeaDecorations } from "./sea-decorations";

interface MapSvgProps {
    fillForCode: (code: string) => string;
    hoveredCode: string | null;
    onHoverChange: (code: string | null) => void;
    onPointerMove: (event: React.PointerEvent<SVGSVGElement>) => void;
    onSelect: (code: string) => void;
    locale: Locale;
    /** Optional code to dim everything else and lift the matching path (province-mode silhouette). */
    isolatedCode?: string | null;
}

/**
 * Pure SVG renderer for the Iran country map. Each `<motion.path>` carries a stable
 * `layoutId` so the consumer can morph a clicked province into a side-panel silhouette via
 * shared layout.
 *
 * The whole `<svg>` listens to a single `onPointerMove` — the per-path tooltip events fire only
 * `onPointerEnter` / `onPointerLeave` to track which code is hovered. This is much cheaper than
 * mounting a Tooltip portal on each path and avoids border-flicker as the cursor crosses
 * province boundaries.
 */
export function MapSvg({ fillForCode, hoveredCode, onHoverChange, onPointerMove, onSelect, isolatedCode, locale }: MapSvgProps) {
    const reduce = useReducedMotion();
    return (
        <svg
            viewBox={IRAN_COUNTRY_VIEWBOX}
            role="img"
            aria-label="Iran provinces"
            className="h-auto w-full"
            onPointerMove={onPointerMove}
            onPointerLeave={() => onHoverChange(null)}
        >
            <SeaDecorations locale={locale} />
            {IRAN_COUNTRY_PROVINCES.map((province) => {
                const isHovered = hoveredCode === province.code;
                const isIsolated = isolatedCode === province.code;
                const dimmed = isolatedCode !== null && isolatedCode !== undefined && !isIsolated;
                return (
                    <motion.path
                        key={province.code}
                        layoutId={`region-${province.code}`}
                        d={province.path}
                        data-region-code={province.code}
                        data-region-name={province.fa}
                        stroke="white"
                        strokeWidth={isHovered ? 1.5 : 0.6}
                        animate={{
                            fill: dimmed ? ZERO_COLOR : fillForCode(province.code),
                            opacity: dimmed ? 0.25 : 1,
                            filter: isHovered ? "brightness(1.08)" : "brightness(1)",
                        }}
                        transition={
                            reduce
                                ? { duration: 0 }
                                : {
                                      fill: { duration: 0.35, ease: "easeInOut" },
                                      opacity: { duration: 0.25 },
                                      filter: { duration: 0.15 },
                                      layout: { type: "spring", stiffness: 240, damping: 28 },
                                  }
                        }
                        style={{ cursor: dimmed ? "default" : "pointer" }}
                        onPointerEnter={() => onHoverChange(province.code)}
                        onClick={() => {
                            if (!dimmed) onSelect(province.code);
                        }}
                    />
                );
            })}
            <ProvinceLabels />
        </svg>
    );
}
