"use client";

import type { Locale } from "@calibra/shared/i18n";

import { Tabs, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { formatNumber } from "#/lib/format";
import type { AdminCouponCounts, CouponTabKey } from "#/lib/types";

const TAB_ORDER: CouponTabKey[] = ["any", "active", "scheduled", "used", "disabled", "expired", "trashed"];

interface CouponStatusTabsProps {
    value: CouponTabKey;
    onChange: (next: CouponTabKey) => void;
    counts?: AdminCouponCounts;
    locale: Locale;
    t: (key: string) => string;
}

function tabCount(counts: AdminCouponCounts | undefined, key: CouponTabKey): number | undefined {
    if (counts === undefined) return undefined;
    switch (key) {
        case "any":
            return counts.all;
        case "active":
            return counts.active;
        case "scheduled":
            return counts.scheduled;
        case "used":
            return counts.used;
        case "disabled":
            return counts.disabled;
        case "expired":
            return counts.expired;
        case "trashed":
            return counts.trashed;
    }
}

export function CouponStatusTabs({ value, onChange, counts, locale, t }: CouponStatusTabsProps) {
    return (
        <Tabs value={value} onValueChange={(next) => onChange(next as CouponTabKey)} variant="line">
            <TabsList className="h-10 flex-wrap gap-6 px-0">
                {TAB_ORDER.map((key) => {
                    const count = tabCount(counts, key);
                    return (
                        <TabsTrigger key={key} value={key} className="px-0">
                            <span>{t(`tabs.${key}`)}</span>
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
