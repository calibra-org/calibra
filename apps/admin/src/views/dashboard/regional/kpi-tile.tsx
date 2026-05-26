"use client";

import type { Locale } from "@calibra/shared/i18n";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useEffect, useMemo } from "react";

import { Skeleton } from "#/components/ui/skeleton";
import { formatMoney, formatNumber } from "#/lib/format";

import { COUNT_UP_SPRING } from "./motion-variants";

interface KpiTileProps {
    label: string;
    value: number;
    formatAs: "number" | "money";
    locale: Locale;
    isPending?: boolean;
    isError?: boolean;
    sublabel?: string;
}

/**
 * Compact KPI tile with a `motion`-driven count-up. The number animates from the previous
 * value toward the new one via a spring; the first mount jumps directly (no count-up from
 * zero) so the dashboard never feels twitchy on first paint. Reduced motion bypasses the
 * spring entirely.
 */
export function KpiTile({ label, value, formatAs, locale, isPending, isError, sublabel }: KpiTileProps) {
    const reduce = useReducedMotion();
    const motionValue = useMotionValue(value);
    const spring = useSpring(motionValue, reduce ? { duration: 0 } : COUNT_UP_SPRING);
    const formatter = useMemo(
        () => (formatAs === "money" ? (v: number) => formatMoney(v, locale) : (v: number) => formatNumber(v, locale)),
        [formatAs, locale],
    );
    const display = useTransform(spring, (latest) => formatter(Math.round(latest)));

    useEffect(() => {
        motionValue.set(value);
    }, [value, motionValue]);

    return (
        <div className="flex flex-col gap-1 rounded-lg border bg-card p-3 text-card-foreground">
            <span className="text-muted-foreground text-xs">{label}</span>
            {isPending ? (
                <Skeleton className="h-6 w-24" />
            ) : isError ? (
                <span className="font-semibold text-lg">—</span>
            ) : (
                <motion.span className="font-semibold text-lg tabular-nums">{display}</motion.span>
            )}
            {sublabel ? <span className="text-muted-foreground text-xs">{sublabel}</span> : null}
        </div>
    );
}
