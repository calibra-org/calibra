import type { Locale } from "@calibra/shared/i18n";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DataTable } from "#/components/DataTable";
import { PageHeader } from "#/components/PageHeader";
import { SubTabs } from "#/components/SubTabs";
import { formatNumber } from "#/lib/format";
import { listTaxClasses } from "#/lib/server-repos";
import type { AdminTaxClass } from "#/lib/types";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Tax.classes" });
    return { title: t("title") };
}

export default async function TaxClassesPage({ params }: PageProps) {
    const { locale: rawLocale } = await params;
    setRequestLocale(rawLocale);
    const locale = rawLocale as Locale;
    const t = await getTranslations("Tax");
    const classesT = await getTranslations("Tax.classes");
    const cols = classesT.raw("table") as Record<string, string>;
    const rows = await listTaxClasses();

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
                rows={rows}
                getRowKey={(row) => row.id}
                emptyState="—"
            />
        </section>
    );
}
