import { toGregorian } from "@mohammadxali/jalaali-js";

/**
 * Parses the admin's unified date-filter URL syntax into a Gregorian `[after, before]` pair the
 * SQL layer can apply directly with `WHERE col >= after AND col <= before`. Mirrors the FE
 * primitive in `apps/admin/src/components/ui/date-picker/url.ts`; both ends stay in sync because
 * the user said "no legacy".
 *
 * Accepted shapes (`<op>:<value>`):
 *   - `in:YYYY-Q1..Q4`
 *   - `in:YYYY-H1` | `in:YYYY-H2`
 *   - `in:YYYY-MM`
 *   - `in:YYYY`
 *   - `before:<period>` / `after:<period>`  — same value formats as above plus `YYYY-MM-DD`
 *   - `within:YYYY-MM-DD..YYYY-MM-DD`
 *
 * Calendar detection: the year inside the period is treated as Jalali when < 1700 and Gregorian
 * when ≥ 1700. Both are converted to Gregorian ISO before returning, so callers see one
 * representation.
 */

export type DateFilterOperator = "in" | "before" | "after" | "within";

export interface ParsedDateFilter {
    /** Closed lower bound (inclusive) on the Gregorian timeline, or null when unbounded. */
    after: Date | null;
    /** Closed upper bound (inclusive) on the Gregorian timeline, or null when unbounded. */
    before: Date | null;
    operator: DateFilterOperator;
}

const OP_REGEX = /^(in|before|after|within):(.+)$/;
const ISO_DATE = /^(\d{3,4})-(\d{1,2})-(\d{1,2})$/;
const ISO_MONTH = /^(\d{3,4})-(\d{1,2})$/;
const ISO_YEAR = /^(\d{3,4})$/;
const QUARTER = /^(\d{3,4})-Q([1-4])$/i;
const HALF_YEAR = /^(\d{3,4})-H([12])$/i;

/**
 * Parse a unified date-filter URL parameter. Returns `null` for malformed or empty input —
 * callers should treat that as "no filter applied" rather than as an error, matching how the FE
 * picker handles a cleared chip.
 */
export function parseDateFilter(raw: string | null | undefined): ParsedDateFilter | null {
    if (raw === null || raw === undefined || raw === "") return null;
    const opMatch = OP_REGEX.exec(raw);
    if (opMatch === null) return null;
    const [, opRaw, rest] = opMatch;
    const operator = opRaw as DateFilterOperator;

    if (operator === "within") {
        const dotdot = rest.indexOf("..");
        if (dotdot === -1) return null;
        const start = periodStart(rest.slice(0, dotdot));
        const end = periodEnd(rest.slice(dotdot + 2));
        if (start === null || end === null) return null;
        return { after: start, before: end, operator };
    }

    const start = periodStart(rest);
    const end = periodEnd(rest);
    if (start === null || end === null) return null;

    if (operator === "before") return { after: null, before: end, operator };
    if (operator === "after") return { after: start, before: null, operator };
    return { after: start, before: end, operator };
}

/**
 * Detect calendar from year magnitude. Persian Solar Hijri years run in the 1300–1700 range; any
 * year that high in Gregorian would be either pre-modern or far-future enough that mixing them
 * up isn't a practical concern.
 */
function isJalaliYear(year: number): boolean {
    return year >= 1300 && year < 1700;
}

/**
 * First instant (UTC midnight) of the period encoded by `value`.
 */
function periodStart(value: string): Date | null {
    const dayMatch = ISO_DATE.exec(value);
    if (dayMatch !== null) {
        return toUtcMidnight(Number(dayMatch[1]), Number(dayMatch[2]), Number(dayMatch[3]));
    }
    const quarter = QUARTER.exec(value);
    if (quarter !== null) {
        const year = Number(quarter[1]);
        const q = Number(quarter[2]);
        const monthZero = (q - 1) * 3;
        return toUtcMidnight(year, monthZero + 1, 1);
    }
    const half = HALF_YEAR.exec(value);
    if (half !== null) {
        const year = Number(half[1]);
        const monthZero = Number(half[2]) === 1 ? 0 : 6;
        return toUtcMidnight(year, monthZero + 1, 1);
    }
    const month = ISO_MONTH.exec(value);
    if (month !== null) {
        return toUtcMidnight(Number(month[1]), Number(month[2]), 1);
    }
    const year = ISO_YEAR.exec(value);
    if (year !== null) {
        return toUtcMidnight(Number(year[1]), 1, 1);
    }
    return null;
}

/**
 * Last instant (UTC end-of-day) of the period encoded by `value`. For closed-period filters
 * (`in`, `within`) the closing instant is the period's final day at 23:59:59.999 UTC so
 * `<= before` matches the entire trailing day.
 */
function periodEnd(value: string): Date | null {
    const dayMatch = ISO_DATE.exec(value);
    if (dayMatch !== null) {
        return toUtcEndOfDay(Number(dayMatch[1]), Number(dayMatch[2]), Number(dayMatch[3]));
    }
    const quarter = QUARTER.exec(value);
    if (quarter !== null) {
        const year = Number(quarter[1]);
        const q = Number(quarter[2]);
        return lastDayOfMonth(year, q * 3);
    }
    const half = HALF_YEAR.exec(value);
    if (half !== null) {
        const year = Number(half[1]);
        const monthOneBased = Number(half[2]) === 1 ? 6 : 12;
        return lastDayOfMonth(year, monthOneBased);
    }
    const month = ISO_MONTH.exec(value);
    if (month !== null) {
        return lastDayOfMonth(Number(month[1]), Number(month[2]));
    }
    const year = ISO_YEAR.exec(value);
    if (year !== null) {
        return lastDayOfMonth(Number(year[1]), 12);
    }
    return null;
}

/**
 * Build a UTC-midnight `Date` from year/month/day. Year < 1700 is interpreted as Jalali and
 * converted to Gregorian.
 */
function toUtcMidnight(year: number, monthOneBased: number, day: number): Date | null {
    const greg = toGregorianTriplet(year, monthOneBased, day);
    if (greg === null) return null;
    return new Date(Date.UTC(greg.gy, greg.gm - 1, greg.gd));
}

function toUtcEndOfDay(year: number, monthOneBased: number, day: number): Date | null {
    const greg = toGregorianTriplet(year, monthOneBased, day);
    if (greg === null) return null;
    return new Date(Date.UTC(greg.gy, greg.gm - 1, greg.gd, 23, 59, 59, 999));
}

function lastDayOfMonth(year: number, monthOneBased: number): Date | null {
    if (isJalaliYear(year)) {
        const nextMonth = monthOneBased === 12 ? { y: year + 1, m: 1 } : { y: year, m: monthOneBased + 1 };
        const nextStart = toGregorianTriplet(nextMonth.y, nextMonth.m, 1);
        if (nextStart === null) return null;
        const nextUtc = new Date(Date.UTC(nextStart.gy, nextStart.gm - 1, nextStart.gd));
        return new Date(nextUtc.getTime() - 1);
    }
    if (monthOneBased < 1 || monthOneBased > 12) return null;
    const lastDay = new Date(Date.UTC(year, monthOneBased, 0));
    return new Date(Date.UTC(lastDay.getUTCFullYear(), lastDay.getUTCMonth(), lastDay.getUTCDate(), 23, 59, 59, 999));
}

function toGregorianTriplet(year: number, monthOneBased: number, day: number): { gy: number; gm: number; gd: number } | null {
    if (monthOneBased < 1 || monthOneBased > 12 || day < 1 || day > 31) return null;
    if (!isJalaliYear(year)) {
        return { gy: year, gm: monthOneBased, gd: day };
    }
    try {
        return toGregorian(year, monthOneBased, day);
    } catch {
        return null;
    }
}
