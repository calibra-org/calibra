"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale, useTranslations } from "next-intl";

import { DataTable } from "#/components/DataTable";
import { SubTabs } from "#/components/SubTabs";
import { SHIPPING_METHODS } from "#/lib/fixtures/shipping-methods";
import type { AdminShippingMethod } from "#/lib/types";

/**
 * Shipping-methods table — renders the static {@link SHIPPING_METHODS} fixture instantly (there is no
 * first-party shipping-method endpoint yet). Kept as a client view for a consistent client/data shape
 * with the rest of the store-config group.
 */
export function ShippingMethodsView() {
    const locale = useLocale() as Locale;
    const methodsT = useTranslations("Shipping.methods");
    const cols = methodsT.raw("table") as Record<string, string>;

    return (
        <>
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
                rows={SHIPPING_METHODS}
                getRowKey={(row) => row.id}
                emptyState="—"
            />
        </>
    );
}
