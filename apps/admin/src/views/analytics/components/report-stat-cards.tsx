"use client";

import type { ComponentType, SVGProps } from "react";

import { StatCard } from "#/components/StatCard";
import { Skeleton } from "#/components/ui/skeleton";
import { Link } from "#/lib/i18n/navigation";
import { cn } from "#/lib/utils";

export interface ReportStat {
    label: string;
    value: string;
    delta?: { percent: number; comparison: string };
    description?: string;
    icon?: ComponentType<SVGProps<SVGSVGElement>>;
    /** When set, the tile becomes a deep-link into the matching report (Overview pattern). */
    href?: string;
}

const COLS: Record<number, string> = {
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
    5: "sm:grid-cols-3 lg:grid-cols-5",
    7: "sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7",
};

/** A responsive grid of KPI tiles. While `isLoading`, renders matching skeleton cards. */
export function ReportStatCards({ items, isLoading, columns }: { items: ReportStat[]; isLoading?: boolean; columns?: number }) {
    const colClass = COLS[columns ?? items.length] ?? COLS[4];
    if (isLoading) {
        return (
            <div className={cn("grid grid-cols-1 gap-3", colClass)}>
                {Array.from({ length: columns ?? items.length ?? 4 }).map((_, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton placeholder
                    <Skeleton key={i} className="h-28 rounded-lg" />
                ))}
            </div>
        );
    }
    return (
        <div className={cn("grid grid-cols-1 gap-3", colClass)}>
            {items.map((item) =>
                item.href ? (
                    <Link
                        key={item.label}
                        href={item.href as never}
                        className="rounded-lg outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <StatCard
                            label={item.label}
                            value={item.value}
                            delta={item.delta}
                            description={item.description}
                            icon={item.icon}
                        />
                    </Link>
                ) : (
                    <StatCard
                        key={item.label}
                        label={item.label}
                        value={item.value}
                        delta={item.delta}
                        description={item.description}
                        icon={item.icon}
                    />
                ),
            )}
        </div>
    );
}

/** Build a StatCard delta from a current/prior pair, or `undefined` when there's no comparison. */
export function buildDelta(current: number, prior: number | undefined, comparison: string): ReportStat["delta"] {
    if (prior === undefined) return undefined;
    if (prior === 0) return { percent: current === 0 ? 0 : 100, comparison };
    return { percent: Math.round(((current - prior) / prior) * 1000) / 10, comparison };
}
