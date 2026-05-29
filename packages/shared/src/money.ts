/**
 * Config-driven money formatting + conversion, shared by the storefront and admin.
 *
 * Calibra stores every monetary value as integer minor units of an immutable BASE currency (Rial).
 * The store operator picks a DISPLAY currency (Toman by default); rendering is driven entirely by a
 * {@link MoneyFormatConfig} resolved from settings + the `currencies` reference table — there are no
 * hardcoded `÷10` conversions or baked-in symbols. This mirrors WooCommerce's `wc_price()` /
 * `get_woocommerce_price_format()` contract.
 *
 * The AdonisJS api keeps a parallel copy at `apps/api/app/services/money.ts` (it does not consume
 * `@calibra/shared`, by design — see `apps/api/app/services/product_import/cell_normalizer.ts`).
 * Keep the two in lockstep; the api copy carries the unit tests.
 */

import { toPersianDigits } from "./digits";

export type CurrencyPosition = "left" | "right" | "left_space" | "right_space";

export interface MoneyFormatConfig {
    /** Display-currency symbol, e.g. `تومان`. */
    symbol: string;
    /** Where the symbol sits relative to the number (mirrors `woocommerce_currency_pos`). */
    position: CurrencyPosition;
    /** Grouping separator inserted every three integer digits. */
    thousandSep: string;
    /** Separator between the integer and fractional parts (only emitted when `decimals > 0`). */
    decimalSep: string;
    /** Number of fractional digits to render. */
    decimals: number;
    /** Stored BASE (Rial) minor units per one MAJOR unit of the display currency (IRT → 10). */
    baseRatio: number;
}

export interface FormatMoneyOptions {
    /** `"fa"` renders Persian digits; anything else keeps ASCII. */
    locale?: "fa" | "en";
    /** When `false`, returns the number only (no symbol). Defaults to `true`. */
    withSymbol?: boolean;
}

const NBSP = "\u00a0";

function groupThousands(intDigits: string, sep: string): string {
    return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

function applyPosition(number: string, symbol: string, position: CurrencyPosition): string {
    if (position === "left") return `${symbol}${number}`;
    if (position === "right") return `${number}${symbol}`;
    if (position === "left_space") return `${symbol}${NBSP}${number}`;
    return `${number}${NBSP}${symbol}`;
}

/**
 * Render a stored BASE-minor amount as a display string. The amount is divided by `baseRatio`,
 * rounded to `decimals`, grouped, localized, and decorated with the symbol per `position`.
 */
export function formatMoney(baseMinor: number, cfg: MoneyFormatConfig, options: FormatMoneyOptions = {}): string {
    const { locale, withSymbol = true } = options;
    const ratio = cfg.baseRatio > 0 ? cfg.baseRatio : 1;
    const decimals = Math.max(0, cfg.decimals);
    const factor = 10 ** decimals;

    const scaled = Math.round((baseMinor / ratio) * factor);
    const sign = scaled < 0 ? "-" : "";
    const abs = Math.abs(scaled);
    const intPart = Math.floor(abs / factor).toString();
    const fracPart = decimals > 0 ? (abs % factor).toString().padStart(decimals, "0") : "";

    const grouped = groupThousands(intPart, cfg.thousandSep);
    let number = decimals > 0 ? `${grouped}${cfg.decimalSep}${fracPart}` : grouped;
    number = sign + number;
    if (locale === "fa") number = toPersianDigits(number);

    if (!withSymbol) return number;
    return applyPosition(number, cfg.symbol, cfg.position);
}

/**
 * Convert an operator-entered MAJOR amount (display currency) into stored BASE minor units.
 * Replaces the ad-hoc `Math.round(toman * 10)` scattered across the product editor and import.
 */
export function parseMajorToBaseMinor(major: number, cfg: MoneyFormatConfig): number {
    const ratio = cfg.baseRatio > 0 ? cfg.baseRatio : 1;
    return Math.round(major * ratio);
}

/**
 * Convert stored BASE minor units back to a MAJOR number — for prefilling numeric form inputs.
 * Replaces the ad-hoc `minor / 10`.
 */
export function baseMinorToMajor(baseMinor: number, cfg: MoneyFormatConfig): number {
    const ratio = cfg.baseRatio > 0 ? cfg.baseRatio : 1;
    return baseMinor / ratio;
}
