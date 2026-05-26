"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";

import { normalizeIranText } from "#/lib/iran-text-normalize";
import { IRAN_COUNTRY_PROVINCES } from "#/vendor/iran-map";
import { loadProvinceGeometry, type ProvinceGeometry } from "#/vendor/iran-map/provinces";

import { type HeatmapMetric, ZERO_COLOR } from "./heatmap-scale";

export interface CityMarker {
    regionCode: string | null;
    name: string;
    ordersCount: number;
    revenueMinor: number;
    matched: boolean;
}

interface ProvinceSvgProps {
    code: string;
    cities: CityMarker[];
    metric: HeatmapMetric;
    onCityHover: (city: CityMarker | null) => void;
    onPointerMove: (event: React.PointerEvent<SVGSVGElement>) => void;
}

const COUNTY_FILL_BASE_ORDERS = ["#eff6ff", "#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#2563eb", "#1d4ed8"] as const;
const COUNTY_FILL_BASE_REVENUE = ["#fef2f2", "#fee2e2", "#fecaca", "#fca5a5", "#f87171", "#ef4444", "#dc2626"] as const;

/**
 * Province-mode SVG. Loads the per-province county (شهرستان) geometry from
 * `vendor/iran-map/provinces/IR-XX.ts` (dynamic import, one bundle per province) and renders
 * each polygon as a `<motion.path>`. Each county is matched to a seeded city by
 * `normalizeIranText` so the operator sees real city order counts on the map.
 *
 * Counties whose name doesn't match a seeded city render in the empty / zero tone — they exist
 * geographically but have no recorded orders in the window.
 */
export function ProvinceSvg({ code, cities, metric, onCityHover, onPointerMove }: ProvinceSvgProps) {
    const reduce = useReducedMotion();
    const [geometry, setGeometry] = useState<ProvinceGeometry | null>(null);

    useEffect(() => {
        let cancelled = false;
        loadProvinceGeometry(code).then((g) => {
            if (!cancelled) setGeometry(g);
        });
        return () => {
            cancelled = true;
        };
    }, [code]);

    const citiesByNormalized = useMemo(() => {
        const map = new Map<string, CityMarker>();
        for (const c of cities) {
            const key = normalizeIranText(c.name);
            if (key) map.set(key, c);
        }
        return map;
    }, [cities]);

    const province = useMemo(() => IRAN_COUNTRY_PROVINCES.find((p) => p.code === code) ?? null, [code]);

    const palette = metric === "revenue" ? COUNTY_FILL_BASE_REVENUE : COUNTY_FILL_BASE_ORDERS;

    const ranges = useMemo(() => {
        if (!geometry) return { max: 0, ladder: [] as Array<{ threshold: number; color: string }> };
        const values: number[] = [];
        for (const county of geometry.counties) {
            const key = normalizeIranText(county.fa);
            const matched = citiesByNormalized.get(key);
            if (matched) {
                values.push(metric === "revenue" ? matched.revenueMinor : matched.ordersCount);
            }
        }
        const nonZero = values.filter((v) => v > 0).sort((a, b) => a - b);
        if (nonZero.length === 0) return { max: 0, ladder: [] };
        const max = nonZero[nonZero.length - 1] ?? 0;
        const ladder = palette.map((color, i) => ({
            threshold: nonZero[Math.floor((nonZero.length - 1) * (i / (palette.length - 1)))] ?? max,
            color,
        }));
        return { max, ladder };
    }, [geometry, citiesByNormalized, metric, palette]);

    const fillFor = (countyName: string) => {
        const key = normalizeIranText(countyName);
        const matched = citiesByNormalized.get(key);
        if (!matched) return ZERO_COLOR;
        const value = metric === "revenue" ? matched.revenueMinor : matched.ordersCount;
        if (value <= 0) return ZERO_COLOR;
        for (const stop of ranges.ladder) {
            if (value <= stop.threshold) return stop.color;
        }
        return ranges.ladder[ranges.ladder.length - 1]?.color ?? ZERO_COLOR;
    };

    if (!geometry || !province) {
        return <div className="aspect-square w-full animate-pulse rounded bg-muted" />;
    }

    return (
        <svg
            viewBox={geometry.viewBox}
            role="img"
            aria-label={`Province ${province.fa}`}
            className="h-auto w-full"
            onPointerMove={onPointerMove}
        >
            <g>
                {geometry.counties.map((county) => {
                    const key = normalizeIranText(county.fa);
                    const matched = citiesByNormalized.get(key) ?? null;
                    return (
                        <motion.path
                            key={county.fa}
                            d={county.path}
                            stroke="white"
                            strokeWidth={0.8}
                            initial={{ fill: ZERO_COLOR, opacity: 0 }}
                            animate={{ fill: fillFor(county.fa), opacity: 1 }}
                            transition={reduce ? { duration: 0 } : { duration: 0.4, ease: "easeInOut" }}
                            whileHover={reduce ? undefined : { filter: "brightness(1.12)" }}
                            style={{ cursor: matched ? "pointer" : "default" }}
                            onPointerEnter={() => {
                                if (matched) {
                                    onCityHover(matched);
                                } else {
                                    onCityHover({
                                        regionCode: null,
                                        name: county.fa,
                                        ordersCount: 0,
                                        revenueMinor: 0,
                                        matched: false,
                                    });
                                }
                            }}
                            onPointerLeave={() => onCityHover(null)}
                        />
                    );
                })}
            </g>
        </svg>
    );
}
