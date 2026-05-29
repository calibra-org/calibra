/**
 * Config-driven money formatting + conversion. Mirrors `packages/shared/src/money.ts` so the API
 * can run independently of the shared package (AdonisJS' `ts-exec` loader does not transpile
 * workspace TS in node_modules — same constraint as
 * `app/services/product_import/cell_normalizer.ts`). Keep the two in lockstep; this copy carries
 * the unit tests (`tests/unit/money.spec.ts`). If the api ever consumes `@calibra/shared` directly,
 * drop this file and re-export from there.
 *
 * Money is stored as integer minor units of the immutable BASE currency (Rial). The display
 * currency's `baseRatio` (Rial minor units per major unit: IRR=1, IRT=10, IRHR=1000, IRHT=10000)
 * drives every conversion — there are no hardcoded `÷10` literals. Mirrors WooCommerce `wc_price()`.
 */

import { toPersianDigits } from "#services/product_import/cell_normalizer";

export type CurrencyPosition = "left" | "right" | "left_space" | "right_space";

export interface MoneyFormatConfig {
    symbol: string;
    position: CurrencyPosition;
    thousandSep: string;
    decimalSep: string;
    decimals: number;
    baseRatio: number;
}

export interface FormatMoneyOptions {
    locale?: "fa" | "en";
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

/** Render a stored BASE-minor amount as a display string per the resolved currency config. */
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

/** Convert an operator-entered MAJOR amount into stored BASE minor units (replaces `× 10`). */
export function parseMajorToBaseMinor(major: number, cfg: MoneyFormatConfig): number {
    const ratio = cfg.baseRatio > 0 ? cfg.baseRatio : 1;
    return Math.round(major * ratio);
}

/** Convert stored BASE minor units to a MAJOR number for numeric export/prefill (replaces `÷ 10`). */
export function baseMinorToMajor(baseMinor: number, cfg: MoneyFormatConfig): number {
    const ratio = cfg.baseRatio > 0 ? cfg.baseRatio : 1;
    return baseMinor / ratio;
}
