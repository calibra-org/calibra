"use client";

import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { normalizeIranText } from "#/lib/iran-text-normalize";
import { IRAN_COUNTRY_PROVINCES } from "#/vendor/iran-map";
import { loadProvinceGeometry, type ProvinceGeometry } from "#/vendor/iran-map/provinces";

import { contrastTextColor } from "./contrast";
import { buildHeatmapScale, type HeatmapMetric } from "./heatmap-scale";
import { ProvinceSea, SEA_FILL } from "./sea-decorations";

export interface CountyMarker {
    name: string;
    ordersCount: number;
    revenueMinor: number;
    matched: boolean;
}

interface ProvinceSvgProps {
    code: string;
    counties: CountyMarker[];
    metric: HeatmapMetric;
    onCountyHover: (county: CountyMarker | null) => void;
    onPointerMove: (event: React.PointerEvent<SVGSVGElement>) => void;
}

interface CountyCenter {
    name: string;
    cx: number;
    cy: number;
    fontSize: number;
}

const LABEL_MIN_FONT = 6;
const LABEL_MAX_FONT = 14;

/**
 * Province-mode SVG. Loads per-province county (شهرستان) geometry from
 * `vendor/iran-map/provinces/IR-XX.ts` (one bundle per province, lazy-loaded) and renders each
 * polygon as a `<motion.path>`. Counties are matched to seeded cities by `normalizeIranText`
 * and coloured with the SAME `buildHeatmapScale` quantile pipeline the country view uses, so
 * the visual language carries through (palette + threshold logic + empty-zero handling).
 *
 * Hover treatment matches the country path — stroke thickens, no brightness filter (which made
 * already-light bins go white). Labels run through the same point-in-fill contrast pass so each
 * county name flips to black or white depending on its polygon underneath.
 */
export function ProvinceSvg({ code, counties, metric, onCountyHover, onPointerMove }: ProvinceSvgProps) {
    const reduce = useReducedMotion();
    const svgRef = useRef<SVGSVGElement | null>(null);
    const pathRefs = useRef(new Map<string, SVGPathElement | null>());
    const [geometry, setGeometry] = useState<ProvinceGeometry | null>(null);
    const [hoveredName, setHoveredName] = useState<string | null>(null);
    const [centers, setCenters] = useState<CountyCenter[]>([]);

    useEffect(() => {
        let cancelled = false;
        loadProvinceGeometry(code).then((g) => {
            if (!cancelled) setGeometry(g);
        });
        return () => {
            cancelled = true;
        };
    }, [code]);

    const province = useMemo(() => IRAN_COUNTRY_PROVINCES.find((p) => p.code === code) ?? null, [code]);

    const countiesByNormalized = useMemo(() => {
        const map = new Map<string, CountyMarker>();
        for (const c of counties) {
            const key = normalizeIranText(c.name);
            if (key) map.set(key, c);
        }
        return map;
    }, [counties]);

    /**
     * Build the same quantile scale the country view uses, but over THIS province's counties.
     * Counties without a seeded match contribute nothing to the domain — they render in the
     * scale's empty colour.
     */
    const scale = useMemo(() => {
        if (!geometry) return buildHeatmapScale([], metric);
        const values = geometry.counties.map((county) => {
            const matched = countiesByNormalized.get(normalizeIranText(county.fa));
            if (!matched) return 0;
            return metric === "revenue" ? matched.revenueMinor : matched.ordersCount;
        });
        return buildHeatmapScale(values, metric);
    }, [geometry, countiesByNormalized, metric]);

    const fillForName = useCallback(
        (countyName: string) => {
            const matched = countiesByNormalized.get(normalizeIranText(countyName));
            if (!matched) return scale.fillFor(0);
            return scale.fillFor(metric === "revenue" ? matched.revenueMinor : matched.ordersCount);
        },
        [countiesByNormalized, metric, scale],
    );

    /** Measure county bbox centers ONCE per geometry change (not per parent re-render). */
    useEffect(() => {
        if (!geometry) return;
        const next: CountyCenter[] = [];
        for (const county of geometry.counties) {
            const el = pathRefs.current.get(county.fa);
            if (!el) continue;
            const box = el.getBBox();
            const fontSize = Math.max(LABEL_MIN_FONT, Math.min(LABEL_MAX_FONT, Math.min(box.width, box.height) * 0.18));
            next.push({
                name: county.fa,
                cx: box.x + box.width / 2,
                cy: box.y + box.height / 2,
                fontSize,
            });
        }
        setCenters(next);
    }, [geometry]);

    /**
     * DOM-only contrast pass — runs whenever the fill resolver changes (metric flip, data
     * update). Mutates label `fill` attributes in place; never calls setState, so no render
     * cascade from parent pointer-move re-renders.
     */
    useEffect(() => {
        const svg = svgRef.current;
        if (!svg || centers.length === 0) return;
        const labels = svg.querySelectorAll<SVGGraphicsElement>("[data-county-label]");
        const countyPaths = svg.querySelectorAll<SVGPathElement>("[data-county-name]");
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
                for (const path of countyPaths) {
                    if (path.isPointInFill(point)) {
                        const name = path.getAttribute("data-county-name");
                        bg = name ? fillForName(name) : null;
                        break;
                    }
                }
            }
            if (bg !== null) {
                label.setAttribute("fill", contrastTextColor(bg));
            }
        }
    }, [fillForName, centers]);

    const setPathRef = useCallback((fa: string) => {
        return (el: SVGPathElement | null) => {
            if (el) {
                pathRefs.current.set(fa, el);
            } else {
                pathRefs.current.delete(fa);
            }
        };
    }, []);

    if (!geometry || !province) {
        return <div className="aspect-square w-full animate-pulse rounded bg-muted" />;
    }

    return (
        <svg
            ref={svgRef}
            viewBox={geometry.viewBox}
            role="img"
            aria-label={`Province ${province.fa}`}
            className="h-auto w-full"
            onPointerMove={onPointerMove}
            onPointerLeave={() => {
                setHoveredName(null);
                onCountyHover(null);
            }}
        >
            <ProvinceSea code={code} />
            <g>
                {geometry.counties.map((county) => {
                    const matched = countiesByNormalized.get(normalizeIranText(county.fa)) ?? null;
                    const isHovered = hoveredName === county.fa;
                    return (
                        <motion.path
                            ref={setPathRef(county.fa)}
                            key={county.fa}
                            d={county.path}
                            data-county-name={county.fa}
                            stroke="white"
                            strokeWidth={isHovered ? 1.6 : 0.6}
                            initial={{ fill: fillForName(county.fa), opacity: 1 }}
                            animate={{ fill: fillForName(county.fa) }}
                            transition={reduce ? { duration: 0 } : { duration: 0.35, ease: "easeInOut" }}
                            style={{ cursor: matched ? "pointer" : "default" }}
                            onPointerEnter={() => {
                                setHoveredName(county.fa);
                                if (matched) {
                                    onCountyHover(matched);
                                } else {
                                    onCountyHover({
                                        name: county.fa,
                                        ordersCount: 0,
                                        revenueMinor: 0,
                                        matched: false,
                                    });
                                }
                            }}
                        />
                    );
                })}
            </g>
            <g style={{ pointerEvents: "none" }}>
                {centers.map((c) => (
                    <text
                        key={`label-${c.name}`}
                        data-county-label=""
                        x={c.cx}
                        y={c.cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="#0f172a"
                        style={{ fontSize: c.fontSize, fontWeight: 600 }}
                    >
                        {c.name}
                    </text>
                ))}
            </g>
        </svg>
    );
}
