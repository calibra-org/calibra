"use client";

import { formatMoney, type MoneyFormatConfig } from "@calibra/shared/money";
import { useLocale } from "next-intl";
import { createContext, type ReactNode, useContext, useMemo } from "react";

import { FALLBACK_MONEY_CONFIG } from "#/lib/currency/config";
import { setActiveMoneyConfig } from "#/lib/format";
import { type AdminGeneralSettings, useGeneralSettings } from "#/lib/queries/general-settings";

const MoneyConfigContext = createContext<MoneyFormatConfig>(FALLBACK_MONEY_CONFIG);

/** Derive the formatter config from the saved General settings (display currency row + format knobs). */
export function deriveMoneyConfig(settings: AdminGeneralSettings): MoneyFormatConfig {
    const row = settings.options.currencies.find((c) => c.code === settings.currency.display);
    return {
        symbol: row?.symbol ?? "",
        position: settings.currency.position as MoneyFormatConfig["position"],
        thousandSep: settings.currency.thousand_sep,
        decimalSep: settings.currency.decimal_sep,
        decimals: settings.currency.num_decimals,
        baseRatio: row?.base_ratio && row.base_ratio > 0 ? row.base_ratio : 1,
    };
}

/**
 * App-wide money-format config. Seeded from a server fetch (`config`) for the first paint, then kept
 * live by the shared General-settings query — so when an operator saves a new currency, the mutation
 * updates that query and **every** price across the admin re-renders without a reload. Also points
 * the pure `formatMoney` singleton (used by non-context column builders) at the same config.
 */
export function MoneyFormatProvider({ config, children }: { config: MoneyFormatConfig; children: ReactNode }) {
    const { data } = useGeneralSettings();
    const resolved = data ? deriveMoneyConfig(data) : config;
    setActiveMoneyConfig(resolved);
    return <MoneyConfigContext.Provider value={resolved}>{children}</MoneyConfigContext.Provider>;
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
