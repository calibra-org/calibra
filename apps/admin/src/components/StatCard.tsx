import { TrendingDown, TrendingUp } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

import { Card, CardContent } from "#/components/ui/card";
import { cn } from "#/lib/utils";

interface StatCardProps {
    label: string;
    value: string;
    delta?: {
        /** Signed percentage change vs the comparison window. */
        percent: number;
        /** Human label for the comparison window (e.g. `"vs last week"`). */
        comparison: string;
    };
    /**
     * Optional one-line caption rendered below the delta (or value, if no delta is supplied).
     * Use it to declare what the metric means — e.g. "Registered in the last 24h".
     */
    description?: string;
    icon?: ComponentType<SVGProps<SVGSVGElement>>;
}

export function StatCard({ label, value, delta, description, icon: Icon }: StatCardProps) {
    const trendingUp = (delta?.percent ?? 0) >= 0;
    const TrendIcon = trendingUp ? TrendingUp : TrendingDown;

    return (
        <Card className="gap-3 py-5">
            <CardContent className="flex flex-col gap-3">
                <div className="flex items-start justify-between">
                    <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">{label}</span>
                    {Icon !== undefined && (
                        <div className="grid size-9 place-items-center rounded-md bg-accent text-accent-foreground">
                            <Icon className="size-4" aria-hidden="true" />
                        </div>
                    )}
                </div>

                <div className="font-semibold text-2xl tracking-tight">{value}</div>

                {delta !== undefined && (
                    <div className="flex items-center gap-1.5 text-xs">
                        <span
                            className={cn(
                                "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium",
                                trendingUp ? "bg-success/10 text-success" : "bg-danger/10 text-danger",
                            )}
                        >
                            <TrendIcon className="size-3" aria-hidden="true" />
                            {trendingUp ? "+" : ""}
                            {delta.percent.toFixed(1)}%
                        </span>
                        <span className="text-muted-foreground">{delta.comparison}</span>
                    </div>
                )}

                {description !== undefined && <span className="text-muted-foreground text-xs leading-snug">{description}</span>}
            </CardContent>
        </Card>
    );
}
