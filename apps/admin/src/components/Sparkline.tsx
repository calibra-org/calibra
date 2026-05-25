import { useId, useMemo } from "react";

interface SparklineProps {
    values: number[];
    width?: number;
    height?: number;
    /** Tone for the stroke + area fill — matches the StatCard accent palette. */
    tone?: "positive" | "negative" | "neutral";
    /** Accessible description for screen readers (e.g. "total customers, last 30 days"). */
    ariaLabel?: string;
}

const STROKE: Record<NonNullable<SparklineProps["tone"]>, string> = {
    positive: "var(--color-emerald-500, #10b981)",
    negative: "var(--color-red-500, #ef4444)",
    neutral: "var(--color-primary, currentColor)",
};

/**
 * Minimal inline SVG sparkline — no chart lib. Renders a stroked polyline + a translucent area
 * fill below it. We compute the polyline path once with `useMemo`, scale into the requested
 * `width` × `height` box, and clamp to a single-pixel offset so a flat series (all zeros) still
 * draws as a thin horizontal line instead of a dot. Used by the dashboard's Customer summary
 * KPI tiles — keeps the dashboard responsive without pulling in a chart package.
 */
export function Sparkline({ values, width = 96, height = 28, tone = "neutral", ariaLabel }: SparklineProps) {
    const gradientId = useId();
    const { path, area } = useMemo(() => {
        if (values.length === 0) return { path: "", area: "" };
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min || 1;
        const step = values.length > 1 ? width / (values.length - 1) : 0;
        const points = values.map((value, i) => {
            const x = i * step;
            const y = height - ((value - min) / range) * (height - 2) - 1;
            return [x, y] as const;
        });
        const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
        const last = points[points.length - 1];
        const first = points[0];
        const area = `${path} L${last[0].toFixed(1)},${height} L${first[0].toFixed(1)},${height} Z`;
        return { path, area };
    }, [values, width, height]);

    if (values.length === 0) return null;

    return (
        <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={ariaLabel}
            preserveAspectRatio="none"
            className="overflow-visible"
        >
            <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={STROKE[tone]} stopOpacity="0.25" />
                    <stop offset="100%" stopColor={STROKE[tone]} stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={area} fill={`url(#${gradientId})`} />
            <path d={path} fill="none" stroke={STROKE[tone]} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}
