/**
 * Cell normalization for the importer's parse pipeline. Mirrors the logic in
 * `packages/shared/src/digits.ts` + `jalali.ts` so the API can run independently of the shared
 * package (AdonisJS' `ts-exec` loader does not currently transpile workspace TS in node_modules).
 * If the api ever consumes `@calibra/shared` directly, drop this file and re-export from there.
 */

import jalaali from "jalaali-js";

const { isValidJalaaliDate, toGregorian } = jalaali;

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

const PERSIAN_TO_ASCII = new Map<string, string>();
for (let i = 0; i < 10; i++) {
    PERSIAN_TO_ASCII.set(PERSIAN_DIGITS[i]!, String(i));
    PERSIAN_TO_ASCII.set(ARABIC_INDIC_DIGITS[i]!, String(i));
}

/** Replace Persian (۰–۹) and Arabic-Indic (٠–٩) digits with ASCII; non-digits pass through. */
export function toEnglishDigits(value: string): string {
    let out = "";
    for (const ch of value) {
        out += PERSIAN_TO_ASCII.get(ch) ?? ch;
    }
    return out;
}

const CURRENCY_SYMBOLS = [
    "﷼",
    "ریال",
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

/** Strip thousand separators (Persian `٬`, Arabic `،`, ASCII `,`, `'`, narrow + regular spaces). */
export function stripThousandSeparators(value: string): string {
    return value
        .replace(/(\d)[٬،,'   ](\d)/g, "$1$2")
        .replace(/(\d)[٬،,'   ](\d)/g, "$1$2");
}

/** Strip recognized currency symbols and 3-letter codes from a price-like string. */
export function stripCurrencySymbols(value: string): string {
    return value.replace(CURRENCY_REGEX, " ").trim();
}

/**
 * Full numeric normalization: digit conversion → currency strip → separator strip → trim.
 * Returns `null` when the cleaned string is not a finite number — callers should emit
 * `invalid_price` / `invalid_stock` / `invalid_number` accordingly.
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

const TRUTHY = new Set(["true", "1", "yes", "y", "on", "بله", "بلی", "آره"]);
const FALSY = new Set(["false", "0", "no", "n", "off", "خیر", "نه"]);

/** Loose boolean parser. Returns `null` for unrecognized values so callers can emit `invalid_boolean`. */
export function parseLooseBoolean(value: string | boolean | number | null | undefined): boolean | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    const ascii = toEnglishDigits(value).trim().toLowerCase();
    if (ascii === "") return null;
    if (TRUTHY.has(ascii)) return true;
    if (FALSY.has(ascii)) return false;
    return null;
}

const DATE_SEPARATORS = /[\/\-.\\]/;

/**
 * Forgiving date parser used by the importer. Accepts Persian + ASCII digits, ISO + slash + dot
 * separators, Jalali (Solar Hijri) years < 1700 → auto-converted to Gregorian. Returns a UTC
 * `Date` on success and `null` on any structural failure so callers can emit `invalid_date`.
 */
export function parseDateLoose(input: string | null | undefined): Date | null {
    if (input === null || input === undefined) return null;
    const ascii = toEnglishDigits(input).trim();
    if (ascii === "") return null;

    const parts = ascii.split(DATE_SEPARATORS).filter((p) => p !== "");
    if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
    const [aRaw, bRaw, cRaw] = parts as [string, string, string];
    const a = Number(aRaw);
    const b = Number(bRaw);
    const c = Number(cRaw);

    if (a >= 1700) return safeUtcDate(a, b, c);
    if (c >= 1700) return safeUtcDate(c, b, a);
    if (a >= 1300 && a < 1700) return safeJalaliDate(a, b, c);
    if (c >= 1300 && c < 1700) return safeJalaliDate(c, b, a);
    return null;
}

function safeUtcDate(year: number, month: number, day: number): Date | null {
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(date.getTime())) return null;
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        return null;
    }
    return date;
}

function safeJalaliDate(jy: number, jm: number, jd: number): Date | null {
    if (!isValidJalaaliDate(jy, jm, jd)) return null;
    const { gy, gm, gd } = toGregorian(jy, jm, jd);
    return new Date(Date.UTC(gy, gm - 1, gd));
}
