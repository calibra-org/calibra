"use client";

import { AlertOctagon, Banknote, Globe, ShoppingBag } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import type { FacetedFilterDef, ToggleFilterDef } from "#/components/data-table";

const PAYMENT_METHODS = ["cod", "bank_transfer", "zarinpal", "idpay", "nextpay", "payir", "zibal"] as const;
const SOURCES = ["checkout", "admin", "api", "import"] as const;
const COUNTRIES = ["IR", "TR", "AE", "DE"] as const;

/**
 * Toolbar filters for the orders list. Status lives in the tab strip — registered as a hidden
 * facet inside `orders-list.tsx` so the URL round-trips through `nuqs` without a visible popover.
 * Payment / source / country are typed inline because the API doesn't currently expose a `facets`
 * endpoint for orders; when one ships, hydrate `options` from a `useOrderFacets()` query the same
 * way the products list does.
 */
export function useOrderFilters(): { facets: FacetedFilterDef[]; toggles: ToggleFilterDef[] } {
    const t = useTranslations("Orders.list.filters");
    const sourceT = useTranslations("Orders.list.source");
    const paymentT = useTranslations("Orders.list.payment");

    const facets = useMemo<FacetedFilterDef[]>(
        () => [
            {
                paramKey: "payment",
                label: t("payment"),
                multiple: true,
                icon: <Banknote className="size-3.5" aria-hidden="true" />,
                options: PAYMENT_METHODS.map((code) => ({ value: code, label: safeT(paymentT, code, code) })),
            },
            {
                paramKey: "source",
                label: t("source"),
                multiple: true,
                icon: <ShoppingBag className="size-3.5" aria-hidden="true" />,
                options: SOURCES.map((code) => ({ value: code, label: safeT(sourceT, code, code) })),
            },
            {
                paramKey: "country",
                label: t("country"),
                multiple: true,
                icon: <Globe className="size-3.5" aria-hidden="true" />,
                options: COUNTRIES.map((code) => ({ value: code, label: code })),
            },
        ],
        [paymentT, sourceT, t],
    );

    const toggles = useMemo<ToggleFilterDef[]>(
        () => [
            {
                paramKey: "needsAttention",
                label: t("needsAttention"),
                icon: <AlertOctagon className="size-3.5" aria-hidden="true" />,
            },
        ],
        [t],
    );

    return { facets, toggles };
}

function safeT(t: (key: never) => string, key: string, fallback: string): string {
    try {
        return t(key as never);
    } catch {
        return fallback;
    }
}
