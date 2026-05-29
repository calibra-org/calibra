import "server-only";

import type { MoneyFormatConfig } from "@calibra/shared/money";

import { apiServer } from "#/lib/api";
import { FALLBACK_MONEY_CONFIG, toMoneyFormatConfig } from "#/lib/currency/config";

/**
 * Server-side fetch of the store's display-currency config (public `GET /api/v1/currency`) for the
 * app-wide {@link MoneyFormatProvider}. Resilient: falls back to Toman defaults if the call fails so
 * a transient currency hiccup never blanks every price in the panel.
 */
export async function getMoneyFormatConfig(): Promise<MoneyFormatConfig> {
    try {
        const api = await apiServer();
        const { data } = await api.storefront.GET("/api/v1/currency");
        return data ? toMoneyFormatConfig(data.data) : FALLBACK_MONEY_CONFIG;
    } catch {
        return FALLBACK_MONEY_CONFIG;
    }
}
