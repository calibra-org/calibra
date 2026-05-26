"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { IRAN_COUNTRY_PROVINCES, IRAN_COUNTRY_VIEWBOX } from "#/vendor/iran-map";

import { type HeatmapMetric, ZERO_COLOR } from "./heatmap-scale";

interface CityMarker {
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

const PROVINCE_FILL_ORDERS = "#3b82f6";
const PROVINCE_FILL_REVENUE = "#ef4444";

const VIEWBOX_PADDING = 10;
const COUNTRY_VIEWBOX = (() => {
    const [x, y, w, h] = IRAN_COUNTRY_VIEWBOX.split(/\s+/).map(Number);
    return { x: x ?? 0, y: y ?? 0, w: w ?? 1080, h: h ?? 1080 };
})();

/**
 * Deterministic 32-bit hash so the same city name always lands at the same relative position
 * within its province bbox across re-renders. Avoids the visual jitter that pure `Math.random()`
 * placement would introduce on every refresh.
 */
function hashString(s: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i += 1) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/**
 * Province-mode SVG with a viewBox zoom into the selected province + city markers overlaid as
 * circles sized by order count. Markers don't carry real lat/lon — sajaddp ships none and
 * react-iran-map doesn't either — so each city's position is a deterministic hash-based offset
 * inside the province's bbox. The relative size/colour communicates the where-orders-cluster
 * story even without real coordinates.
 */
export function ProvinceSvg({ code, cities, metric, onCityHover, onPointerMove }: ProvinceSvgProps) {
    const reduce = useReducedMotion();
    const pathRef = useRef<SVGPathElement | null>(null);
    const [bbox, setBbox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

    const province = useMemo(() => IRAN_COUNTRY_PROVINCES.find((p) => p.code === code) ?? null, [code]);

    useEffect(() => {
        if (pathRef.current === null) return;
        const box = pathRef.current.getBBox();
        setBbox({ x: box.x, y: box.y, w: box.width, h: box.height });
    }, []);

    const viewBox = bbox
        ? `${bbox.x - VIEWBOX_PADDING} ${bbox.y - VIEWBOX_PADDING} ${bbox.w + VIEWBOX_PADDING * 2} ${bbox.h + VIEWBOX_PADDING * 2}`
        : `${COUNTRY_VIEWBOX.x} ${COUNTRY_VIEWBOX.y} ${COUNTRY_VIEWBOX.w} ${COUNTRY_VIEWBOX.h}`;

    const fill = metric === "revenue" ? PROVINCE_FILL_REVENUE : PROVINCE_FILL_ORDERS;

    const maxValue = Math.max(...cities.map((c) => (metric === "revenue" ? c.revenueMinor : c.ordersCount)), 1);

    const markers = useMemo(() => {
        if (!bbox) return [];
        return cities.map((city) => {
            const h1 = hashString(`${city.name}-x`);
            const h2 = hashString(`${city.name}-y`);
            const insetX = bbox.w * 0.08;
            const insetY = bbox.h * 0.08;
            const cx = bbox.x + insetX + ((h1 % 1000) / 1000) * (bbox.w - insetX * 2);
            const cy = bbox.y + insetY + ((h2 % 1000) / 1000) * (bbox.h - insetY * 2);
            const value = metric === "revenue" ? city.revenueMinor : city.ordersCount;
            const minR = Math.max(2, Math.min(bbox.w, bbox.h) * 0.012);
            const maxR = Math.max(6, Math.min(bbox.w, bbox.h) * 0.05);
            const ratio = value / maxValue;
            const r = minR + ratio * (maxR - minR);
            return { city, cx, cy, r };
        });
    }, [bbox, cities, metric, maxValue]);

    if (province === null) return null;

    return (
        <svg
            viewBox={viewBox}
            role="img"
            aria-label={`Province ${province.fa}`}
            className="h-auto w-full"
            onPointerMove={onPointerMove}
        >
            <motion.path
                ref={pathRef}
                layoutId={`region-${code}`}
                d={province.path}
                fill={fill}
                fillOpacity={0.35}
                stroke={fill}
                strokeWidth={0.8}
                transition={reduce ? { duration: 0 } : { layout: { type: "spring", stiffness: 240, damping: 28 } }}
            />
            {markers.map(({ city, cx, cy, r }) => {
                const key = city.regionCode ?? `unmatched-${city.name}`;
                return (
                    <motion.circle
                        key={key}
                        cx={cx}
                        cy={cy}
                        r={r}
                        fill={fill}
                        stroke="white"
                        strokeWidth={0.6}
                        fillOpacity={city.matched ? 0.9 : 0.5}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 22, delay: 0.08 }}
                        style={{ cursor: "pointer", transformOrigin: `${cx}px ${cy}px` }}
                        whileHover={reduce ? undefined : { scale: 1.15 }}
                        onPointerEnter={() => onCityHover(city)}
                        onPointerLeave={() => onCityHover(null)}
                    />
                );
            })}
            <text
                x={bbox ? bbox.x + bbox.w / 2 : 0}
                y={bbox ? bbox.y - 4 : 0}
                textAnchor="middle"
                style={{ fontSize: Math.max(8, (bbox?.h ?? 100) * 0.04), fontWeight: 600 }}
                fill={ZERO_COLOR}
            >
                {province.fa}
            </text>
        </svg>
    );
}
