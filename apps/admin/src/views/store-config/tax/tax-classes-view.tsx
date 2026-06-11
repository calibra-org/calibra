"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale, useTranslations } from "next-intl";

import { DataTable } from "#/components/DataTable";
import { SubTabs } from "#/components/SubTabs";
import { TAX_CLASSES } from "#/lib/fixtures/tax-classes";
import { formatNumber } from "#/lib/format";
import type { AdminTaxClass } from "#/lib/types";

/**
 * Tax-classes table — renders the static {@link TAX_CLASSES} fixture instantly (there is no
 * first-party tax-class endpoint yet). Kept as a client view for a consistent client/data shape with
 * the rest of the store-config group.
 */
export function TaxClassesView() {
    const locale = useLocale() as Locale;
    const classesT = useTranslations("Tax.classes");
    const cols = classesT.raw("table") as Record<string, string>;

    return (
        <>
            <SubTabs
                namespace="Tax.tabs"
                tabs={[
                    { href: "/tax/classes", labelKey: "classes" },
                    { href: "/tax/rates", labelKey: "rates" },
                ]}
            />

            <DataTable<AdminTaxClass>
                columns={[
                    { id: "name", header: cols.name, cell: (row) => <span className="font-medium">{row.name[locale]}</span> },
                    {
                        id: "slug",
                        header: cols.slug,
                        cell: (row) => <span className="font-mono text-muted-foreground text-xs">{row.slug}</span>,
                    },
                    {
                        id: "rates",
                        header: cols.rateCount,
                        cell: (row) => formatNumber(row.rateCount, locale),
                        className: "text-end",
                    },
                ]}
                rows={TAX_CLASSES}
                getRowKey={(row) => row.id}
                emptyState="—"
            />
        </>
    );
}
