/**
 * Digit and number normalization for Persian-first data import.
 *
 * Operators paste prices and stock counts copied from Excel, sheets, ERP exports — these arrive as
 * mixed Persian (۰–۹), Arabic-Indic (٠–٩), and ASCII digits, often with Persian thousand separators
 * (`٬`), commas, and currency suffixes (`تومان`, `ریال`, `﷼`, `$`, `€`). This module funnels all
 * those shapes into a single canonical ASCII numeric string before parsing.
 */

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

const PERSIAN_TO_ASCII = new Map<string, string>();
const ASCII_TO_PERSIAN = new Map<string, string>();
for (let i = 0; i < 10; i++) {
    PERSIAN_TO_ASCII.set(PERSIAN_DIGITS[i]!, String(i));
    PERSIAN_TO_ASCII.set(ARABIC_INDIC_DIGITS[i]!, String(i));
    ASCII_TO_PERSIAN.set(String(i), PERSIAN_DIGITS[i]!);
}

/**
 * Replace Persian (۰–۹) and Arabic-Indic (٠–٩) digits in `value` with their ASCII equivalents.
 * Non-digit characters pass through unchanged.
 */
export function toEnglishDigits(value: string): string {
    let out = "";
    for (const ch of value) {
        out += PERSIAN_TO_ASCII.get(ch) ?? ch;
    }
    return out;
}

/**
 * Replace ASCII digits (0–9) with Persian digits (۰–۹). Non-digit characters pass through unchanged.
 * Use for display when the active locale is `fa`.
 */
export function toPersianDigits(value: string | number): string {
    const source = typeof value === "number" ? String(value) : value;
    let out = "";
    for (const ch of source) {
        out += ASCII_TO_PERSIAN.get(ch) ?? ch;
    }
    return out;
}

/**
 * Strip thousand separators that appear *between* digits — Persian `٬`, Arabic `،`, ASCII `,`, the
 * apostrophe-style `'`, and narrow / regular spaces. A separator at the start/end or between
 * non-digit characters is preserved (e.g. `"hello, world"` is left alone).
 */
export function stripThousandSeparators(value: string): string {
    return value.replace(/(\d)[٬،,'   ](\d)/g, "$1$2").replace(
        /(\d)[٬،,'   ](\d)/g,
        "$1$2",
    );
}

const CURRENCY_SYMBOLS = [
    "﷼",
    "ریال",
    "﷼",
    "تومان",
    "تومن",
    "$",
    "€",
    "£",
    "¥",
    "USD",
    "EUR",
    "GBP",
    "IRR",
    "IRT",
    "Toman",
    "Rial",
];

const CURRENCY_REGEX = new RegExp(
    CURRENCY_SYMBOLS.map((sym) => sym.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
    "gi",
);

/**
 * Remove currency symbols and codes from a price-like string. Removes both leading and trailing
 * occurrences as well as ones surrounded by whitespace.
 */
export function stripCurrencySymbols(value: string): string {
    return value.replace(CURRENCY_REGEX, " ").trim();
}

/**
 * Full normalization pipeline for a numeric cell: digit conversion → currency strip →
 * thousand-separator strip → whitespace trim. Returns the cleaned ASCII numeric string ready for
 * `Number(...)`. If the result is not a finite number, returns `null`.
 */
export function parseLooseNumber(value: string | number | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const ascii = toEnglishDigits(trimmed);
    const noCurrency = stripCurrencySymbols(ascii);
    const noSep = stripThousandSeparators(noCurrency);
    const cleaned = noSep.replace(/\s+/g, "");
    if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
}

/**
 * Loose boolean parser — accepts ASCII and Persian variants of yes / no / true / false / 1 / 0 /
 * `بله` / `خیر` / `بلی` / `نه`. Returns `null` when the value is unrecognized.
 */
export function parseLooseBoolean(value: string | boolean | number | null | undefined): boolean | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    const ascii = toEnglishDigits(value).trim().toLowerCase();
    if (ascii === "") return null;
    if (["true", "1", "yes", "y", "on", "بله", "بلی", "آره"].includes(ascii)) return true;
    if (["false", "0", "no", "n", "off", "خیر", "نه"].includes(ascii)) return false;
    return null;
}
