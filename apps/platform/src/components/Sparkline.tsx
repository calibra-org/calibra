"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";

import { cn } from "#/lib/utils";

interface SparklineProps {
    /** Series values, oldest → newest. Rendered left-to-right (time axis stays LTR even under RTL). */
    data: number[];
    width?: number;
    height?: number;
    /** Tailwind stroke colour class. Defaults to the signature accent. */
    strokeClass?: string;
    /** Fill the area under the line with a faint gradient of the stroke colour. */
    fill?: boolean;
    className?: string;
}

/**
 * Tiny hand-rolled SVG sparkline — no recharts overhead for an inline trend. The line draws in on
 * mount (≤600ms) unless the operator prefers reduced motion. The SVG coordinate system is inherently
 * left-to-right (it does not mirror under RTL), so the time axis stays oldest → newest in the console.
 */
export function Sparkline({
    data,
    width = 96,
    height = 28,
    strokeClass = "stroke-primary",
    fill = true,
    className,
}: SparklineProps) {
    const reduce = useReducedMotion();
    const gradientId = useId();

    if (data.length === 0) return null;

    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const stepX = data.length > 1 ? width / (data.length - 1) : 0;
    const pad = 2;
    const usableH = height - pad * 2;
    const points = data.map((value, index) => {
        const x = data.length > 1 ? index * stepX : width / 2;
        const y = pad + (usableH - ((value - min) / range) * usableH);
        return [x, y] as const;
    });
    const line = points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const area = `${line} L${width.toFixed(1)},${height} L0,${height} Z`;

    return (
        <svg
            viewBox={`0 0 ${width} ${height}`}
            width={width}
            height={height}
            fill="none"
            preserveAspectRatio="none"
            aria-hidden="true"
            className={cn("overflow-visible", className)}
        >
            {fill ? (
                <>
                    <defs>
                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="currentColor" stopOpacity={0.22} />
                            <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <path d={area} className={cn(strokeClass.replace("stroke-", "text-"))} fill={`url(#${gradientId})`} />
                </>
            ) : null}
            <motion.path
                d={line}
                className={strokeClass}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={reduce ? false : { pathLength: 0, opacity: 0.4 }}
                animate={reduce ? undefined : { pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
            />
        </svg>
    );
}
