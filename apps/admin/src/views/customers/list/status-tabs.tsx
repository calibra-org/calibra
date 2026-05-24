"use client";

import type { Locale } from "@calibra/shared/i18n";

import { Tabs, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { formatNumber } from "#/lib/format";
import type { AdminCustomerCounts } from "#/lib/types";
import type { CustomerTabKey } from "#/lib/queries/customers";

const TAB_ORDER: CustomerTabKey[] = ["any", "account", "guest", "big", "new", "inactive", "no_address", "trashed"];

interface CustomerStatusTabsProps {
    value: CustomerTabKey;
    onChange: (next: CustomerTabKey) => void;
    counts?: AdminCustomerCounts;
    locale: Locale;
    t: (key: string) => string;
}

function tabCount(counts: AdminCustomerCounts | undefined, key: CustomerTabKey): number {
    if (counts === undefined) return 0;
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

export function CustomerStatusTabs({ value, onChange, counts, locale, t }: CustomerStatusTabsProps) {
    return (
        <Tabs value={value} onValueChange={(v) => onChange(v as CustomerTabKey)}>
            <TabsList className="flex h-auto flex-wrap gap-1 bg-transparent p-0">
                {TAB_ORDER.map((key) => (
                    <TabsTrigger
                        key={key}
                        value={key}
                        className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground rounded-md px-3 py-1.5 text-sm"
                    >
                        <span>{t(`tabs.${key}`)}</span>
                        <span className="ms-2 inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded-full bg-muted px-1.5 text-muted-foreground text-xs">
                            {formatNumber(tabCount(counts, key), locale)}
                        </span>
                    </TabsTrigger>
                ))}
            </TabsList>
        </Tabs>
    );
}
