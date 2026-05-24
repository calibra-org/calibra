"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useTranslations } from "next-intl";

import { Tabs, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { formatNumber } from "#/lib/format";
import type { OrderCountsMap } from "#/lib/queries/orders";
import type { OrderStatus } from "#/lib/types";

export type StatusTabKey = OrderStatus | "any" | "trashed";

const TAB_ORDER: StatusTabKey[] = [
    "any",
    "pending",
    "processing",
    "on_hold",
    "completed",
    "cancelled",
    "refunded",
    "failed",
    "draft",
    "trashed",
];

interface StatusTabsProps {
    value: StatusTabKey;
    onChange: (next: StatusTabKey) => void;
    counts?: OrderCountsMap;
    locale: Locale;
}

/**
 * Tab strip across the top of the orders list. Counts are sourced from `useOrderCounts()` and
 * rendered as muted parentheticals so an empty bucket reads visually distinct from a never-loaded
 * one (the latter omits the parenthesis entirely until the request resolves).
 */
export function StatusTabs({ value, onChange, counts, locale }: StatusTabsProps) {
    const t = useTranslations("Orders.list");
    const statusT = useTranslations("OrderStatus");

    return (
        <Tabs value={value} onValueChange={(next) => onChange(next as StatusTabKey)} variant="line" aria-label={t("title")}>
            <TabsList className="h-10 flex-wrap gap-6 px-0">
                {TAB_ORDER.map((key) => {
                    const count = countFor(counts, key);
                    const label = labelFor(key, t, statusT);
                    return (
                        <TabsTrigger key={key} value={key} className="px-0">
                            <span>{label}</span>
                            {count !== undefined && (
                                <span className="ms-1 text-muted-foreground/80 tabular-nums">
                                    ({formatNumber(count, locale)})
                                </span>
                            )}
                        </TabsTrigger>
                    );
                })}
            </TabsList>
        </Tabs>
    );
}

function countFor(counts: OrderCountsMap | undefined, key: StatusTabKey): number | undefined {
    if (counts === undefined) return undefined;
    if (key === "any") return counts.all;
    return counts[key];
}

function labelFor(
    key: StatusTabKey,
    t: ReturnType<typeof useTranslations>,
    statusT: ReturnType<typeof useTranslations>,
): string {
    if (key === "any") return t("tabs.all");
    if (key === "trashed") return t("tabs.trashed");
    return statusT(key);
}
