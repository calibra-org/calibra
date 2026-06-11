"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale, useTranslations } from "next-intl";

import { DataTable } from "#/components/DataTable";
import { SubTabs } from "#/components/SubTabs";
import { Checkbox } from "#/components/ui/checkbox";
import { TAX_RATES } from "#/lib/fixtures/tax-rates";
import { formatNumber, formatPercent } from "#/lib/format";
import type { AdminTaxRate } from "#/lib/types";

/**
 * Tax-rates table — renders the static {@link TAX_RATES} fixture instantly (there is no first-party
 * tax-rate endpoint yet). Kept as a client view for a consistent client/data shape with the rest of
 * the store-config group.
 */
export function TaxRatesView() {
    const locale = useLocale() as Locale;
    const ratesT = useTranslations("Tax.rates");
    const cols = ratesT.raw("table") as Record<string, string>;

    return (
        <>
            <SubTabs
                namespace="Tax.tabs"
                tabs={[
                    { href: "/tax/classes", labelKey: "classes" },
                    { href: "/tax/rates", labelKey: "rates" },
                ]}
            />

            <DataTable<AdminTaxRate>
                columns={[
                    { id: "label", header: cols.label, cell: (row) => <span className="font-medium">{row.label[locale]}</span> },
                    { id: "country", header: cols.country, cell: (row) => row.country ?? ratesT("anywhere") },
                    { id: "province", header: cols.province, cell: (row) => row.provinceCode ?? "—" },
                    {
                        id: "rate",
                        header: cols.rate,
                        cell: (row) => formatPercent(row.ratePercent, locale, 2),
                        className: "text-end",
                    },
                    {
                        id: "priority",
                        header: cols.priority,
                        cell: (row) => formatNumber(row.priority, locale),
                        className: "text-end",
                    },
                    { id: "compound", header: cols.compound, cell: (row) => <Checkbox checked={row.compound} disabled /> },
                    {
                        id: "shipping",
                        header: cols.appliesToShipping,
                        cell: (row) => <Checkbox checked={row.appliesToShipping} disabled />,
                    },
                ]}
                rows={TAX_RATES}
                getRowKey={(row) => row.id}
                emptyState="—"
            />
        </>
    );
}
