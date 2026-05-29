import "server-only";

import { formatMoney, type MoneyFormatConfig } from "@calibra/shared/money";

import { apiServer } from "#/lib/api";

/** Toman defaults — used when the currency config can't be loaded so prices never blank out. */
const FALLBACK_MONEY_CONFIG: MoneyFormatConfig = {
    symbol: "تومان",
    position: "right_space",
    thousandSep: "٬",
    decimalSep: ".",
    decimals: 0,
    baseRatio: 10,
};

/**
 * Resolve the store's display-currency config (public `GET /api/v1/currency`). Both the storefront
 * and admin format prices from this single source, so they always agree. Resilient to a transient
 * failure via the Toman fallback.
 */
export async function getMoneyFormatConfig(): Promise<MoneyFormatConfig> {
    try {
        const api = await apiServer();
        const { data } = await api.storefront.GET("/api/v1/currency");
        if (!data) return FALLBACK_MONEY_CONFIG;
        const d = data.data.display;
        return {
            symbol: d.symbol,
            position: d.position,
            thousandSep: d.thousand_sep,
            decimalSep: d.decimal_sep,
            decimals: d.num_decimals,
            baseRatio: d.base_ratio,
        };
    } catch {
        return FALLBACK_MONEY_CONFIG;
    }
}

/** Format a stored BASE-minor (Rial) price; empty string for a missing value. */
export function formatPrice(value: number | null | undefined, config: MoneyFormatConfig, locale: string): string {
    if (value === null || value === undefined) return "";
    return formatMoney(value, config, { locale: locale === "fa" ? "fa" : "en" });
}
