import type { StorefrontSchemas } from "@calibra/sdk";
import type { MoneyFormatConfig } from "@calibra/shared/money";

export type CurrencyConfig = StorefrontSchemas["schemas"]["CurrencyConfig"];

/**
 * Safe default (Toman) used when the currency config can't be loaded — keeps money rendering sane
 * rather than throwing. Matches the seeded store defaults.
 */
export const FALLBACK_MONEY_CONFIG: MoneyFormatConfig = {
    symbol: "تومان",
    position: "right_space",
    thousandSep: "٬",
    decimalSep: ".",
    decimals: 0,
    baseRatio: 10,
};

/** Project the API `CurrencyConfig` onto the shared formatter's `MoneyFormatConfig` shape. */
export function toMoneyFormatConfig(cfg: CurrencyConfig): MoneyFormatConfig {
    return {
        symbol: cfg.display.symbol,
        position: cfg.display.position,
        thousandSep: cfg.display.thousand_sep,
        decimalSep: cfg.display.decimal_sep,
        decimals: cfg.display.num_decimals,
        baseRatio: cfg.display.base_ratio,
    };
}
