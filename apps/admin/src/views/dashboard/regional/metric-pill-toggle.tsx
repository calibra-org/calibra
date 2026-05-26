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
 * Two-state segmented toggle (`orders` ↔ `revenue`) styled to match the standard admin toolbar
 * height (`h-8`) and `rounded-md` chrome. A `motion.div` with `layoutId="metric-pill"` slides
 * the active-state background between positions so the heatmap-mode swap stays visually anchored.
 */
export function MetricPillToggle({ value, onChange }: MetricPillToggleProps) {
    const t = useTranslations("Dashboard.regional");
    const options: ReadonlyArray<{ value: HeatmapMetric; label: string }> = [
        { value: "orders", label: t("metricOrders") },
        { value: "revenue", label: t("metricRevenue") },
    ];

    return (
        <div className="inline-flex h-8 items-center rounded-md border border-input bg-muted p-0.5 text-sm">
            {options.map((option) => {
                const isActive = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        onClick={() => onChange(option.value)}
                        className={cn(
                            "relative z-10 inline-flex h-7 items-center rounded-sm px-3 text-xs transition-colors",
                            isActive ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {isActive ? (
                            <motion.span
                                layoutId="metric-pill"
                                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                                className="absolute inset-0 -z-10 rounded-sm bg-primary"
                            />
                        ) : null}
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}
