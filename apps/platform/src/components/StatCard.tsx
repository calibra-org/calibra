"use client";

import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { type ReactNode, useEffect } from "react";

import { Sparkline } from "#/components/Sparkline";
import { type LucideIcon, TrendingDown, TrendingUp } from "#/icons";
import { cn } from "#/lib/utils";

/** Animated numeric readout — counts up from zero on mount, springs between values on refetch. */
function CountUpValue({ to, format }: { to: number; format: (n: number) => string }) {
    const reduce = useReducedMotion();
    const motionValue = useMotionValue(reduce ? to : 0);
    const spring = useSpring(motionValue, reduce ? { duration: 0 } : { stiffness: 90, damping: 18, mass: 0.6 });
    const display = useTransform(spring, (latest) => format(Math.round(latest)));

    useEffect(() => {
        motionValue.set(to);
    }, [to, motionValue]);

    return <motion.span>{display}</motion.span>;
}

interface TrendDelta {
    /** Signed percentage change. Positive renders ▲ + success, negative ▼ + danger, zero is neutral. */
    value: number;
    /** Optional context, e.g. "vs prev 30d". */
    label?: string;
}

export interface StatCardProps {
    label: string;
    /** Static value. Ignored when `countUp` is provided. */
    value?: ReactNode;
    /** Animated numeric value with its own formatter (count-up on mount). */
    countUp?: { to: number; format: (n: number) => string };
    sublabel?: ReactNode;
    icon?: LucideIcon;
    trend?: TrendDelta;
    /** Inline sparkline series (oldest → newest). */
    spark?: number[];
    /** "accent" is the hero KPI: violet top-glow + accent icon chip. */
    tone?: "default" | "accent";
    className?: string;
}

/**
 * Dense KPI tile for the console — a mission-control panel with an optional count-up value, a
 * trend delta (▲/▼ + %), and an inline sparkline. Numerics are tabular; the accent tone adds the
 * signature violet top-glow for the hero metric. Motion respects `prefers-reduced-motion`.
 */
export function StatCard({
    label,
    value,
    countUp,
    sublabel,
    icon: Icon,
    trend,
    spark,
    tone = "default",
    className,
}: StatCardProps) {
    const accent = tone === "accent";
    const trendUp = trend !== undefined && trend.value > 0;
    const trendDown = trend !== undefined && trend.value < 0;
    const TrendIcon = trendUp ? TrendingUp : TrendingDown;

    return (
        <div className={cn("mission-panel flex flex-col gap-2 p-4", accent && "mission-panel-accent", className)}>
            <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">{label}</span>
                {Icon ? (
                    <span
                        className={cn(
                            "grid size-7 shrink-0 place-items-center rounded-md",
                            accent ? "bg-primary/15 text-primary" : "bg-muted/70 text-muted-foreground",
                        )}
                    >
                        <Icon className="size-4" aria-hidden="true" />
                    </span>
                ) : null}
            </div>
            <div className="flex items-end justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                    <span className="font-semibold text-2xl tabular-nums leading-none">
                        {countUp ? <CountUpValue to={countUp.to} format={countUp.format} /> : value}
                    </span>
                    {trend !== undefined ? (
                        <span
                            className={cn(
                                "inline-flex items-center gap-1 text-xs tabular-nums",
                                trendUp && "text-success",
                                trendDown && "text-danger",
                                !trendUp && !trendDown && "text-muted-foreground",
                            )}
                        >
                            {trendUp || trendDown ? <TrendIcon className="size-3.5" aria-hidden="true" /> : null}
                            <span>
                                {trend.value > 0 ? "+" : ""}
                                {trend.value}%
                            </span>
                            {trend.label ? <span className="text-muted-foreground">{trend.label}</span> : null}
                        </span>
                    ) : sublabel ? (
                        <span className="text-muted-foreground text-xs">{sublabel}</span>
                    ) : null}
                </div>
                {spark && spark.length > 1 ? (
                    <Sparkline data={spark} strokeClass={accent ? "stroke-primary" : "stroke-accent-cyan"} className="shrink-0" />
                ) : null}
            </div>
        </div>
    );
}
