"use client";

import type { Locale } from "@calibra/shared/i18n";

import { formatMoney, formatNumber } from "#/lib/format";
import type { AdminCustomerCounts } from "#/lib/types";

interface StatsFooterProps {
    counts?: AdminCustomerCounts;
    locale: Locale;
    t: (key: string, values?: Record<string, string | number>) => string;
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex flex-col gap-0.5 px-4 py-2.5">
            <span className="text-muted-foreground text-xs uppercase tracking-wide">{label}</span>
            <span className="font-semibold text-sm">{value}</span>
        </div>
    );
}

export function CustomerStatsFooter({ counts, locale, t }: StatsFooterProps) {
    if (counts === undefined) {
        return (
            <div className="border-t bg-muted/30 text-muted-foreground text-sm py-3 px-4">{t("footer.loading")}</div>
        );
    }
    return (
        <div className="flex flex-wrap items-center divide-x divide-border border-t bg-muted/30 rtl:divide-x-reverse">
            <Stat label={t("footer.customers")} value={formatNumber(counts.all, locale)} />
            <Stat label={t("footer.avgOrderCount")} value={formatNumber(counts.summary.avgOrderCount, locale)} />
            <Stat label={t("footer.avgLifetimeSpend")} value={formatMoney(counts.summary.avgLifetimeSpend, locale)} />
            <Stat label={t("footer.avgAov")} value={formatMoney(counts.summary.avgAov, locale)} />
            <Stat
                label={t("footer.pctWithAccount")}
                value={`${formatNumber(Math.round(counts.summary.pctWithAccount), locale)}%`}
            />
        </div>
    );
}
