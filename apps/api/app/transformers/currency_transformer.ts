import type { ResolvedCurrencyConfig } from "#services/currency_config_service";

/**
 * Shapes the public `GET /api/v1/currency` response. Both FE apps turn this into a
 * `MoneyFormatConfig` and feed it to the shared formatter, so prices render identically across the
 * storefront and admin.
 */
export function toCurrencyConfig(resolved: ResolvedCurrencyConfig) {
    return {
        base: resolved.baseCode,
        display: {
            code: resolved.displayCode,
            symbol: resolved.symbol,
            name: { fa: resolved.nameFa, en: resolved.nameEn },
            position: resolved.position,
            thousand_sep: resolved.thousandSep,
            decimal_sep: resolved.decimalSep,
            num_decimals: resolved.numDecimals,
            base_ratio: resolved.baseRatio,
        },
    };
}
