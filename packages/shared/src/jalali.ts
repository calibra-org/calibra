/**
 * Jalali (Solar Hijri) ↔ Gregorian conversion + a forgiving date parser used by the product
 * importer.
 *
 * Operators paste dates copied from Persian admin tools and spreadsheets — typical shapes are
 * `۱۴۰۵/۰۳/۰۳`, `1405-03-03`, `2026/05/24`, `24/05/2026`. The parser detects the calendar from the
 * year magnitude (any year < 1700 is treated as Jalali), normalizes Persian digits, and returns a
 * UTC `Date` regardless of the input flavour. Wrong-shaped strings return `null` so the importer
 * can mark the row as `invalid_date`.
 */

import jalaali from "jalaali-js";

import { toEnglishDigits } from "./digits";

const { isValidJalaaliDate, toGregorian, toJalaali } = jalaali;

export interface JalaliDate {
    jy: number;
    jm: number;
    jd: number;
}

export interface GregorianDate {
    gy: number;
    gm: number;
    gd: number;
}

/**
 * Convert a Jalali Y/M/D to a UTC midnight `Date`. Throws on invalid Jalali components.
 */
export function jalaliToDate(jy: number, jm: number, jd: number): Date {
    if (!isValidJalaaliDate(jy, jm, jd)) {
        throw new RangeError(`Invalid Jalali date: ${jy}/${jm}/${jd}`);
    }
    const { gy, gm, gd } = toGregorian(jy, jm, jd);
    return new Date(Date.UTC(gy, gm - 1, gd));
}

/**
 * Decompose a `Date` (interpreted in UTC) into Jalali year/month/day components.
 */
export function dateToJalali(date: Date): JalaliDate {
    return toJalaali(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

const DATE_SEPARATORS = /[/\-.\\]/;

/**
 * Parse a date string from any of the shapes the importer accepts and return a UTC `Date`.
 *
 * Detection rules:
 * - Persian / Arabic-Indic digits are normalized to ASCII first.
 * - Years < 1700 are treated as Jalali (Solar Hijri); the algorithm currently supports years up to
 *   ~1700 SH which corresponds to ~2321 AD, so the threshold is safe for a century-and-change.
 * - ISO `YYYY-MM-DD`, `YYYY/MM/DD`, slash- and dot-separated forms are all accepted.
 * - DD/MM/YYYY is accepted as a fallback when the leading component is ≤ 31.
 *
 * Returns `null` for strings that don't parse cleanly so callers can surface an `invalid_date`
 * error instead of receiving an `Invalid Date`.
 */
export function parseDateLoose(input: string | null | undefined): Date | null {
    if (input === null || input === undefined) return null;
    const ascii = toEnglishDigits(input).trim();
    if (ascii === "") return null;

    const parts = ascii.split(DATE_SEPARATORS).filter((p) => p !== "");
    if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
    const [a, b, c] = parts as [string, string, string];
    const aN = Number(a);
    const bN = Number(b);
    const cN = Number(c);

    if (aN >= 1700) return safeUtcDate(aN, bN, cN);
    if (cN >= 1700) {
        if (aN > 12) return safeUtcDate(cN, bN, aN);
        return safeUtcDate(cN, bN, aN);
    }
    if (aN < 1700 && aN >= 1300) {
        try {
            return jalaliToDate(aN, bN, cN);
        } catch {
            return null;
        }
    }
    if (cN < 1700 && cN >= 1300) {
        try {
            return jalaliToDate(cN, bN, aN);
        } catch {
            return null;
        }
    }
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
