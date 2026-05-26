"use client";

import type { Locale } from "@calibra/shared/i18n";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

import { IRAN_COUNTRY_PROVINCES, IRAN_COUNTRY_VIEWBOX } from "#/vendor/iran-map";

import { contrastTextColor } from "./contrast";
import { ZERO_COLOR } from "./heatmap-scale";
import { ProvinceLabels } from "./province-labels";
import { SEA_FILL, SeaDecorations } from "./sea-decorations";

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
 * After mount (and whenever the heatmap metric flips), a point-in-fill pass walks every
 * `[data-region-label]` element, samples the polygon underneath via `isPointInFill`, and writes
 * the WCAG-readable colour (black or white) into the label's `fill`. The seas use the same
 * mechanism — labels that land on the dark-blue water flip to white automatically.
 */
export function MapSvg({
    fillForCode,
    hoveredCode,
    onHoverChange,
    onPointerMove,
    onSelect,
    isolatedCode,
    locale,
}: MapSvgProps) {
    const reduce = useReducedMotion();
    const svgRef = useRef<SVGSVGElement | null>(null);

    useEffect(() => {
        /**
         * Re-run whenever the fill resolver changes (metric flip, isolation flip — both move
         * through `fillForCode`'s closure). `metric` + `isolatedCode` are intentionally NOT in
         * the dep list because the resolver identity already changes with them.
         */
        const svg = svgRef.current;
        if (!svg) return;
        const labels = svg.querySelectorAll<SVGGraphicsElement>("[data-region-label]");
        const provincePaths = svg.querySelectorAll<SVGPathElement>("[data-region-code]");
        const seaPaths = svg.querySelectorAll<SVGPathElement>("[data-region-sea]");

        for (const label of labels) {
            const box = label.getBBox();
            const point = svg.createSVGPoint();
            point.x = box.x + box.width / 2;
            point.y = box.y + box.height / 2;

            let bg: string | null = null;

            for (const sea of seaPaths) {
                if (sea.isPointInFill(point)) {
                    bg = SEA_FILL;
                    break;
                }
            }
            if (bg === null) {
                for (const path of provincePaths) {
                    if (path.isPointInFill(point)) {
                        const code = path.getAttribute("data-region-code");
                        bg = code ? fillForCode(code) : null;
                        break;
                    }
                }
            }

            if (bg !== null) {
                label.setAttribute("fill", contrastTextColor(bg));
            }
        }
    }, [fillForCode]);

    return (
        <svg
            ref={svgRef}
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
