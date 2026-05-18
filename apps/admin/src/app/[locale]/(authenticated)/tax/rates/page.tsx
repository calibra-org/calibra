import type { Locale } from "@calibra/shared/i18n";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DataTable } from "#/components/DataTable";
import { PageHeader } from "#/components/PageHeader";
import { SubTabs } from "#/components/SubTabs";
import { Checkbox } from "#/components/ui/checkbox";
import { formatNumber, formatPercent } from "#/lib/format";
import { listTaxRates } from "#/lib/mock/repos";
import type { AdminTaxRate } from "#/lib/mock/types";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Tax.rates" });
    return { title: t("title") };
}

export default async function TaxRatesPage({ params }: PageProps) {
    const { locale: rawLocale } = await params;
    setRequestLocale(rawLocale);
    const locale = rawLocale as Locale;
    const t = await getTranslations("Tax");
    const ratesT = await getTranslations("Tax.rates");
    const cols = ratesT.raw("table") as Record<string, string>;
    const rows = await listTaxRates();

    return (
        <section className="flex flex-col gap-6">
            <PageHeader title={t("title")} subtitle={t("subtitle")} />
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
                    { id: "rate", header: cols.rate, cell: (row) => formatPercent(row.ratePercent, locale, 2), className: "text-end" },
                    { id: "priority", header: cols.priority, cell: (row) => formatNumber(row.priority, locale), className: "text-end" },
                    { id: "compound", header: cols.compound, cell: (row) => <Checkbox checked={row.compound} disabled /> },
                    { id: "shipping", header: cols.appliesToShipping, cell: (row) => <Checkbox checked={row.appliesToShipping} disabled /> },
                ]}
                rows={rows}
                getRowKey={(row) => row.id}
                emptyState="—"
            />
        </section>
    );
}
