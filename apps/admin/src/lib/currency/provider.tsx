"use client";

import { formatMoney, type MoneyFormatConfig } from "@calibra/shared/money";
import { useLocale } from "next-intl";
import { createContext, type ReactNode, useContext, useMemo } from "react";

import { FALLBACK_MONEY_CONFIG } from "#/lib/currency/config";
import { setActiveMoneyConfig } from "#/lib/format";

const MoneyConfigContext = createContext<MoneyFormatConfig>(FALLBACK_MONEY_CONFIG);

/**
 * Provides the store's resolved money-format config to the whole admin. Mounted once in the
 * authenticated layout from a server-side fetch, so every cell/column/card formats prices through
 * the same currency config — no hardcoded ÷10 or baked-in symbols. Also points the pure
 * `formatMoney` singleton (used by non-context column builders) at the same config.
 */
export function MoneyFormatProvider({ config, children }: { config: MoneyFormatConfig; children: ReactNode }) {
    setActiveMoneyConfig(config);
    return <MoneyConfigContext.Provider value={config}>{children}</MoneyConfigContext.Provider>;
}

export interface MoneyFormatter {
    config: MoneyFormatConfig;
    /** Format a stored BASE-minor (Rial) amount into a localized display string. */
    format: (baseMinor: number, options?: { withSymbol?: boolean }) => string;
}

/** Locale-bound money formatter sourced from the active currency config. */
export function useMoney(): MoneyFormatter {
    const config = useContext(MoneyConfigContext);
    const locale = useLocale();
    return useMemo(
        () => ({
            config,
            format: (baseMinor, options) =>
                formatMoney(baseMinor, config, {
                    locale: locale === "fa" ? "fa" : "en",
                    withSymbol: options?.withSymbol ?? true,
                }),
        }),
        [config, locale],
    );
}
