import type { Locale } from "@calibra/shared/i18n";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DataTable } from "#/components/DataTable";
import { PageHeader } from "#/components/PageHeader";
import { StatusBadge } from "#/components/StatusBadge";
import { SubTabs } from "#/components/SubTabs";
import { formatNumber } from "#/lib/format";
import { listShippingZones } from "#/lib/server-repos";
import type { AdminShippingZone } from "#/lib/types";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Shipping.zones" });
    return { title: t("title") };
}

export default async function ShippingZonesPage({ params }: PageProps) {
    const { locale: rawLocale } = await params;
    setRequestLocale(rawLocale);
    const locale = rawLocale as Locale;
    const t = await getTranslations("Shipping");
    const zonesT = await getTranslations("Shipping.zones");
    const cols = zonesT.raw("table") as Record<string, string>;
    const rows = await listShippingZones();

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

            <DataTable<AdminShippingZone>
                columns={[
                    {
                        id: "name",
                        header: cols.name,
                        cell: (row) => (
                            <div className="flex items-center gap-2">
                                <span className="font-medium">{row.name[locale]}</span>
                                {row.isFallback && <StatusBadge tone="info">{zonesT("fallback")}</StatusBadge>}
                            </div>
                        ),
                    },
                    {
                        id: "countries",
                        header: cols.countries,
                        cell: (row) =>
                            row.countries.length === 0 ? (
                                <span className="text-muted-foreground">{zonesT("noCountries")}</span>
                            ) : (
                                row.countries.join(", ")
                            ),
                    },
                    {
                        id: "methods",
                        header: cols.methodCount,
                        cell: (row) => formatNumber(row.methodCount, locale),
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
