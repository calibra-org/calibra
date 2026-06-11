"use client";

import type { AdminSchemas } from "@calibra/sdk";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet } from "#/lib/queries/api-client";
import type { AdminPaymentGateway, LocalizedString, PaymentGatewayCode } from "#/lib/types";

type SdkAdminPaymentGateway = AdminSchemas["schemas"]["AdminPaymentGateway"];

/**
 * Display titles for the gateways the platform recognises. The API stores a bare machine `code`
 * (and never a localized title), so the admin UI carries the fa/en label set here. Unknown codes
 * fall back to the raw code in both locales.
 */
const KNOWN_GATEWAY_TITLES: Record<string, LocalizedString> = {
    zarinpal: { fa: "زرین‌پال", en: "Zarinpal" },
    idpay: { fa: "آی‌دی پی", en: "IDPay" },
    nextpay: { fa: "نکست‌پی", en: "NextPay" },
    payir: { fa: "پی پینگ", en: "Pay.ir" },
    zibal: { fa: "زیبال", en: "Zibal" },
    cod: { fa: "پرداخت در محل", en: "Cash on Delivery" },
    bank_transfer: { fa: "انتقال بانکی", en: "Bank Transfer" },
};

/** Fans a single locale-resolved string out to both locale slots so `value[locale]` access works. */
function dup(value: string | null | undefined): LocalizedString {
    const safe = typeof value === "string" ? value : "";
    return { fa: safe, en: safe };
}

/**
 * Adapts the SDK payment-gateway wire shape into the admin view type. Relocated from the deleted
 * `server-repos.ts` so it runs client-side; identical semantics.
 */
export function toAdminPaymentGateway(g: SdkAdminPaymentGateway): AdminPaymentGateway {
    const titles = KNOWN_GATEWAY_TITLES[g.code] ?? { fa: g.code, en: g.code };
    const settings: Record<string, string> = {};
    for (const [k, v] of Object.entries(g.settings ?? {})) settings[k] = v === null || v === undefined ? "" : String(v);
    return {
        id: g.id,
        code: g.code as PaymentGatewayCode,
        title: titles,
        description: dup(""),
        customerInstructions: dup(""),
        enabled: Boolean(g.enabled),
        ordering: g.ordering ?? 0,
        supportsRefunds: Boolean((g.supports as Record<string, unknown>)?.refunds ?? false),
        implementationStatus: g.implementation_status === "live" ? "live" : "stub",
        settings,
    };
}

interface PaymentGatewaysEnvelope {
    data: SdkAdminPaymentGateway[];
}

const LIST_KEY = (locale: string) => ["admin", "payment-gateways", "list", { locale }] as const;

/**
 * Lists the tenant's payment gateways through the same-origin admin proxy. Shared by the Payments
 * settings screen and the manual-order payment-method picker. Sorted by `ordering` to match the
 * storefront checkout order.
 */
export function usePaymentGateways() {
    const locale = useLocale();
    return useQuery({
        queryKey: LIST_KEY(locale),
        queryFn: ({ signal }) => apiGet<PaymentGatewaysEnvelope>("payment-gateways", { locale, signal }),
        select: (res): AdminPaymentGateway[] =>
            (res.data ?? []).map(toAdminPaymentGateway).sort((a, b) => a.ordering - b.ordering),
        staleTime: 5 * 60 * 1000,
    });
}

/**
 * Resolves a single gateway by `code` from the cached list. Returns `undefined` while loading and
 * `null` when the code is unknown, so the detail screen can render a not-found state.
 */
export function usePaymentGateway(code: string) {
    const list = usePaymentGateways();
    const gateway = list.data ? (list.data.find((g) => g.code === code) ?? null) : undefined;
    return { ...list, data: gateway };
}
