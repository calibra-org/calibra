"use client";

import { motion } from "motion/react";
import { useTranslations } from "next-intl";

import { cn } from "#/lib/utils";

import type { HeatmapMetric } from "./heatmap-scale";

interface MetricPillToggleProps {
    value: HeatmapMetric;
    onChange: (next: HeatmapMetric) => void;
}

/**
 * Two-state segmented toggle (`orders` ↔ `revenue`) with a `motion.div` `layoutId="metric-pill"`
 * underlay that morphs between positions on click. Replaces a plain shadcn `Tabs` so the
 * heatmap-mode swap stays visually anchored.
 */
export function MetricPillToggle({ value, onChange }: MetricPillToggleProps) {
    const t = useTranslations("Dashboard.regional");
    const options: ReadonlyArray<{ value: HeatmapMetric; label: string }> = [
        { value: "orders", label: t("metricOrders") },
        { value: "revenue", label: t("metricRevenue") },
    ];

    return (
        <div className="relative inline-flex items-center rounded-full border bg-muted p-1">
            {options.map((option) => {
                const isActive = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        onClick={() => onChange(option.value)}
                        className={cn(
                            "relative z-10 rounded-full px-3 py-1 text-xs transition-colors",
                            isActive ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {isActive ? (
                            <motion.span
                                layoutId="metric-pill"
                                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                                className="absolute inset-0 -z-10 rounded-full bg-primary"
                            />
                        ) : null}
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}
