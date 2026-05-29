import Currency from "#models/currency";
import type { CurrencyPosition, MoneyFormatConfig } from "#services/money";
import SettingsService from "#services/settings_service";

/**
 * Resolved currency configuration — the single shape both the public `GET /currency` endpoint and
 * the admin General settings transformer build from. Money is stored as integer minor units of the
 * BASE currency (Rial); `baseRatio` (the DISPLAY currency's Rial-minor-per-major) drives every
 * conversion. The BASE is assumed to be Rial (IRR) for the Iran-only scope — display currency
 * ratios in the `currencies` table are Rial-relative.
 */
export interface ResolvedCurrencyConfig {
    baseCode: string;
    displayCode: string;
    symbol: string;
    nameEn: string;
    nameFa: string;
    position: CurrencyPosition;
    thousandSep: string;
    decimalSep: string;
    numDecimals: number;
    baseRatio: number;
}

const POSITIONS: readonly CurrencyPosition[] = ["left", "right", "left_space", "right_space"];

/** Toman defaults — the resolved config never throws, so a missing row can't crash commerce flows. */
const DEFAULT_DISPLAY = {
    code: "IRT",
    symbol: "تومان",
    nameEn: "Iranian toman",
    nameFa: "تومان",
    decimals: 0,
    position: "right_space" as CurrencyPosition,
    baseRatio: 10,
};

function asPosition(value: unknown, fallback: CurrencyPosition): CurrencyPosition {
    return typeof value === "string" && POSITIONS.includes(value as CurrencyPosition) ? (value as CurrencyPosition) : fallback;
}

/**
 * Read the General settings group + the chosen display currency row and merge them into a single
 * resolved config. The four format knobs (`currency_position`, `price_*`) override the currency
 * reference-row defaults; symbol + `base_ratio` always come from the row.
 */
export async function resolveCurrencyConfig(): Promise<ResolvedCurrencyConfig> {
    const settings = new SettingsService();
    const general = await settings.all("general");

    const baseCode = typeof general.currency === "string" ? general.currency : "IRR";
    const displayCode = typeof general.currency_display_default === "string" ? general.currency_display_default : "IRT";

    const row = (await Currency.findBy("code", displayCode)) ?? (await Currency.findBy("code", "IRT"));
    const display = row ?? DEFAULT_DISPLAY;

    return {
        baseCode,
        displayCode: display.code,
        symbol: display.symbol,
        nameEn: display.nameEn,
        nameFa: display.nameFa,
        position: asPosition(general.currency_position, display.position as CurrencyPosition),
        thousandSep: typeof general.price_thousand_sep === "string" ? general.price_thousand_sep : "٬",
        decimalSep: typeof general.price_decimal_sep === "string" ? general.price_decimal_sep : ".",
        numDecimals: typeof general.price_num_decimals === "number" ? general.price_num_decimals : display.decimals,
        baseRatio: display.baseRatio,
    };
}

/** Project a resolved config onto the {@link MoneyFormatConfig} shape consumed by the formatter. */
export function toMoneyFormatConfig(resolved: ResolvedCurrencyConfig): MoneyFormatConfig {
    return {
        symbol: resolved.symbol,
        position: resolved.position,
        thousandSep: resolved.thousandSep,
        decimalSep: resolved.decimalSep,
        decimals: resolved.numDecimals,
        baseRatio: resolved.baseRatio,
    };
}

export interface CountryOption {
    code: string;
    nameEn: string;
    nameFa: string;
    enabled: boolean;
}

/**
 * Supported countries for the store-address + selling/shipping-location pickers. Iran-only scope:
 * `IR` is the single enabled country; the rest ship disabled to prove the model extends without a
 * migration. There is no `countries` table — this static set is the source until multi-country
 * support is built out.
 */
export const SUPPORTED_COUNTRIES: readonly CountryOption[] = [
    { code: "IR", nameEn: "Iran", nameFa: "ایران", enabled: true },
    { code: "AE", nameEn: "United Arab Emirates", nameFa: "امارات متحده عربی", enabled: false },
    { code: "AF", nameEn: "Afghanistan", nameFa: "افغانستان", enabled: false },
    { code: "IQ", nameEn: "Iraq", nameFa: "عراق", enabled: false },
    { code: "TR", nameEn: "Turkey", nameFa: "ترکیه", enabled: false },
];
