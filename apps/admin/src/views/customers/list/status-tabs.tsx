"use client";

import type { Locale } from "@calibra/shared/i18n";

import { Tabs, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { formatNumber } from "#/lib/format";
import type { CustomerTabKey } from "#/lib/queries/customers";
import type { AdminCustomerCounts } from "#/lib/types";

const TAB_ORDER: CustomerTabKey[] = ["any", "account", "guest", "big", "new", "inactive", "no_address", "trashed"];

interface CustomerStatusTabsProps {
    value: CustomerTabKey;
    onChange: (next: CustomerTabKey) => void;
    counts?: AdminCustomerCounts;
    locale: Locale;
    t: (key: string) => string;
}

function tabCount(counts: AdminCustomerCounts | undefined, key: CustomerTabKey): number | undefined {
    if (counts === undefined) return undefined;
    switch (key) {
        case "any":
            return counts.all;
        case "account":
            return counts.accountHolders;
        case "guest":
            return counts.guest;
        case "big":
            return counts.bigSpenders;
        case "new":
            return counts.new30d;
        case "inactive":
            return counts.inactive180d;
        case "no_address":
            return counts.noAddress;
        case "trashed":
            return counts.trashed;
    }
}

/**
 * Tab strip across the top of the customers list. Mirrors the Orders workbench: `variant="line"`
 * underline-active style with the count rendered as a muted parenthetical so an empty bucket
 * (`(0)`) reads visually distinct from a never-loaded one (the parenthesis is omitted entirely
 * until counts resolve).
 */
export function CustomerStatusTabs({ value, onChange, counts, locale, t }: CustomerStatusTabsProps) {
    return (
        <Tabs value={value} onValueChange={(next) => onChange(next as CustomerTabKey)} variant="line">
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
