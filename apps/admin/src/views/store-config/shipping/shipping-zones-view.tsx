"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale, useTranslations } from "next-intl";

import { DataTable } from "#/components/DataTable";
import { StatusBadge } from "#/components/StatusBadge";
import { SubTabs } from "#/components/SubTabs";
import { SHIPPING_ZONES } from "#/lib/fixtures/shipping-zones";
import { formatNumber } from "#/lib/format";
import type { AdminShippingZone } from "#/lib/types";

/**
 * Shipping-zones table — renders the static {@link SHIPPING_ZONES} fixture instantly (there is no
 * first-party shipping-zone endpoint yet). Kept as a client view for a consistent client/data shape
 * with the rest of the store-config group.
 */
export function ShippingZonesView() {
    const locale = useLocale() as Locale;
    const zonesT = useTranslations("Shipping.zones");
    const cols = zonesT.raw("table") as Record<string, string>;

    return (
        <>
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
                rows={SHIPPING_ZONES}
                getRowKey={(row) => row.id}
                emptyState="—"
            />
        </>
    );
}
