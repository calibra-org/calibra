import { TrendingDown, TrendingUp } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

import { Sparkline } from "#/components/Sparkline";
import { CardContent, CardRoot } from "#/components/ui/card";
import { cn } from "#/lib/utils";

/**
 * Visual category for the tile — drives the icon-block background + accent and the sparkline
 * stroke colour. Pick the tone that matches the metric's meaning, not its current direction
 * (`returns` is always `danger` even when it's zero; `net_sales` is always `success`).
 */
export type StatCardTone = "default" | "success" | "info" | "warning" | "danger" | "neutral";

export interface StatCardDelta {
    /** Signed change vs the comparison window. Positive renders the up-arrow + green chip. */
    value: number;
    /** `percent` renders `+12.3%`; `absolute` renders `+12` (suited to counts like new customers). */
    unit?: "percent" | "absolute";
    /** Caption next to the chip, e.g. `"vs last week"` / `"از ۳۰ روز پیش"`. */
    comparison: string;
}

interface StatCardProps {
    label: string;
    value: string;
    delta?: StatCardDelta;
    /** Optional one-line caption rendered under the value (or under the delta when both are set). */
    description?: string;
    icon?: ComponentType<SVGProps<SVGSVGElement>>;
    /** Drives the icon-block colour. Default is the primary brand colour. */
    tone?: StatCardTone;
    /** Daily series rendered as an inline sparkline beneath the delta. */
    sparkline?: number[];
    sparklineLabel?: string;
    className?: string;
}

/**
 * Pair-of-classes lookup for each tone — applied to the colored 40×40 icon block on the start
 * edge of the card. Uses the design-system semantic tokens (`--primary`/`--success`/`--info`/
 * `--warning`/`--danger`) so dark mode inherits automatically.
 */
const ICON_STYLES: Record<StatCardTone, string> = {
    default: "bg-primary/12 text-primary",
    success: "bg-success/14 text-success",
    info: "bg-info/14 text-info",
    warning: "bg-warning/16 text-warning",
    danger: "bg-danger/14 text-danger",
    neutral: "bg-muted text-muted-foreground",
};

/** Sparkline tone derived from the StatCard tone so the inline series matches the icon accent. */
const SPARK_TONES: Record<StatCardTone, "positive" | "negative" | "neutral"> = {
    default: "neutral",
    success: "positive",
    info: "neutral",
    warning: "neutral",
    danger: "negative",
    neutral: "neutral",
};

/**
 * Universal KPI tile used across the dashboard and the analytics reports. Horizontal layout: a
 * 40×40 tone-coloured icon block on the start edge, then a stacked content column (label, value,
 * delta pill + comparison, optional description, optional sparkline). Padding is tight (`p-4`)
 * and the value renders with tabular numerals so a row of tiles always aligns. The sparkline is
 * a regular flex child — never absolute-positioned — so it can't collide with the delta line.
 */
export function StatCard({
    label,
    value,
    delta,
    description,
    icon: Icon,
    tone = "default",
    sparkline,
    sparklineLabel,
    className,
}: StatCardProps) {
    const trendingUp = (delta?.value ?? 0) >= 0;
    const TrendIcon = trendingUp ? TrendingUp : TrendingDown;
    const formattedDelta = delta
        ? delta.unit === "absolute"
            ? `${trendingUp ? "+" : ""}${Math.round(delta.value)}`
            : `${trendingUp ? "+" : ""}${delta.value.toFixed(1)}%`
        : null;
    const showSparkline = sparkline !== undefined && sparkline.length > 0;

    return (
        <CardRoot className={cn("gap-0 overflow-hidden p-0", className)}>
            <CardContent className="flex items-start gap-3 p-4">
                {Icon !== undefined && (
                    <div className={cn("grid size-9 shrink-0 place-items-center rounded-md", ICON_STYLES[tone])}>
                        <Icon className="size-4" aria-hidden="true" />
                    </div>
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="font-medium text-[0.7rem] text-muted-foreground uppercase tracking-wide">{label}</span>
                    <span className="truncate font-semibold text-foreground text-lg tabular-nums leading-snug tracking-tight">
                        {value}
                    </span>
                    {delta !== undefined && (
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs">
                            <span
                                className={cn(
                                    "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium",
                                    trendingUp ? "bg-success/10 text-success" : "bg-danger/10 text-danger",
                                )}
                            >
                                <TrendIcon className="size-3" aria-hidden="true" />
                                <span className="tabular-nums">{formattedDelta}</span>
                            </span>
                            <span className="truncate text-muted-foreground">{delta.comparison}</span>
                        </div>
                    )}
                    {description !== undefined && (
                        <span className="mt-0.5 text-muted-foreground text-xs leading-snug">{description}</span>
                    )}
                    {showSparkline && (
                        <div className="-mx-0.5 mt-1.5">
                            <Sparkline
                                values={sparkline}
                                width={140}
                                height={24}
                                tone={SPARK_TONES[tone]}
                                ariaLabel={sparklineLabel}
                            />
                        </div>
                    )}
                </div>
            </CardContent>
        </CardRoot>
    );
}
