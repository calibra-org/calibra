import type { Locale } from "@calibra/shared/i18n";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DataTable } from "#/components/DataTable";
import { PageHeader } from "#/components/PageHeader";
import { SubTabs } from "#/components/SubTabs";
import { listShippingMethods } from "#/lib/mock/repos";
import type { AdminShippingMethod } from "#/lib/mock/types";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Shipping.methods" });
    return { title: t("title") };
}

export default async function ShippingMethodsPage({ params }: PageProps) {
    const { locale: rawLocale } = await params;
    setRequestLocale(rawLocale);
    const locale = rawLocale as Locale;
    const t = await getTranslations("Shipping");
    const methodsT = await getTranslations("Shipping.methods");
    const cols = methodsT.raw("table") as Record<string, string>;
    const rows = await listShippingMethods();

    return (
        <section className="flex flex-col gap-6">
            <PageHeader title={t("title")} subtitle={t("subtitle")} />
            <SubTabs
                namespace="Shipping.tabs"
                tabs={[
                    { href: "/shipping/zones", labelKey: "zones" },
                    { href: "/shipping/methods", labelKey: "methods" },
                ]}
            />

            <DataTable<AdminShippingMethod>
                columns={[
                    {
                        id: "title",
                        header: cols.title,
                        cell: (row) => <span className="font-medium">{row.titleDefault[locale]}</span>,
                    },
                    {
                        id: "code",
                        header: cols.code,
                        cell: (row) => <span className="font-mono text-muted-foreground text-xs">{row.code}</span>,
                    },
                    {
                        id: "description",
                        header: cols.description,
                        cell: (row) => <span className="text-muted-foreground text-sm">{row.descriptionDefault[locale]}</span>,
                    },
                ]}
                rows={rows}
                getRowKey={(row) => row.id}
                emptyState="—"
            />
        </section>
    );
}
