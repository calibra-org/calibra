import * as JalaliDateFns from "date-fns-jalali";
import { DateLib, defaultDateLib } from "react-day-picker";

import type { Calendar, Granularity, LegacyDateRange, PeriodString } from "./types";

/**
 * react-day-picker's `DateLib` exposes the date-fns surface the picker needs internally. For Jalali
 * we hand it the `date-fns-jalali` namespace as the `overrides` argument — every internal call
 * (addDays, getMonth, format, …) then runs through the Jalali implementation, so the same `Date`
 * object renders as its Jalali year/month/day.
 *
 * @see {@link https://daypicker.dev/docs/localization#use-jalali-calendar}
 */
const jalaliDateLib = new DateLib({ weekStartsOn: 6 }, JalaliDateFns as unknown as Partial<DateLib>);

/**
 * Returns the active dateLib for a given calendar. The returned object obeys the date-fns API
 * surface (addDays, startOfMonth, getYear, …) but interprets `Date` instances in either Gregorian
 * or Jalali — period math and grid rendering both flow through it.
 */
export function getDateLib(calendar: Calendar): DateLib {
    return calendar === "jalali" ? jalaliDateLib : defaultDateLib;
}

/**
 * Returns the calendar that pairs with a given UI locale by convention. Persian → Jalali, English →
 * Gregorian. Consumers that need a non-default pairing pass `calendar` explicitly.
 */
export function calendarForLocale(locale: "fa" | "en"): Calendar {
    return locale === "fa" ? "jalali" : "gregorian";
}

/**
 * Day-of-week the calendar week starts on. Jalali weeks start Saturday (per Iranian convention);
 * Gregorian defaults to Sunday so the en grid matches en-US, which is what the operators expect.
 */
export function weekStartsOnFor(calendar: Calendar): 0 | 6 {
    return calendar === "jalali" ? 6 : 0;
}

/**
 * Returns the first day of the quarter containing `date` in the active calendar. Quarters split
 * the calendar year into three-month chunks (Q1 = months 0–2, Q2 = 3–5, …) regardless of which
 * calendar — both Gregorian and Jalali use 12 months, so the same formula holds.
 */
export function startOfQuarter(date: Date, lib: DateLib): Date {
    const month = lib.getMonth(date);
    const quarterStartMonth = Math.floor(month / 3) * 3;
    return lib.startOfMonth(lib.setMonth(date, quarterStartMonth));
}

/**
 * Last day of the quarter containing `date`. Returns the final day of the third month in the
 * quarter (e.g., Q1 → March 31 Gregorian / Khordad 31 Jalali).
 */
export function endOfQuarter(date: Date, lib: DateLib): Date {
    const month = lib.getMonth(date);
    const quarterEndMonth = Math.floor(month / 3) * 3 + 2;
    return lib.endOfMonth(lib.setMonth(date, quarterEndMonth));
}

/**
 * First day of the half-year (H1 = months 0–5, H2 = 6–11) containing `date`.
 */
export function startOfHalfYear(date: Date, lib: DateLib): Date {
    const month = lib.getMonth(date);
    const halfStartMonth = month < 6 ? 0 : 6;
    return lib.startOfMonth(lib.setMonth(date, halfStartMonth));
}

/**
 * Last day of the half-year containing `date` (end of June Gregorian / end of Shahrivar Jalali for
 * H1; end of year for H2).
 */
export function endOfHalfYear(date: Date, lib: DateLib): Date {
    const month = lib.getMonth(date);
    const halfEndMonth = month < 6 ? 5 : 11;
    return lib.endOfMonth(lib.setMonth(date, halfEndMonth));
}

/** Quarter number (1–4) for `date`. */
export function getQuarter(date: Date, lib: DateLib): 1 | 2 | 3 | 4 {
    return (Math.floor(lib.getMonth(date) / 3) + 1) as 1 | 2 | 3 | 4;
}

/** Half-year number (1 | 2) for `date`. */
export function getHalfYear(date: Date, lib: DateLib): 1 | 2 {
    return lib.getMonth(date) < 6 ? 1 : 2;
}

/**
 * Build a `Date` representing the first day of the given period in the active calendar. Used when
 * the user clicks a period cell — we anchor on the period start so subsequent math (range
 * endpoints, day-grid scrolling) is deterministic.
 */
export function buildDateForPeriod(
    granularity: Granularity,
    year: number,
    month: number,
    day: number,
    lib: DateLib,
): Date {
    const base = lib.startOfDay(lib.setYear(lib.setMonth(lib.today(), month), year));
    if (granularity === "day") {
        return lib.addDays(lib.startOfMonth(base), day - 1);
    }
    if (granularity === "month") {
        return lib.startOfMonth(base);
    }
    if (granularity === "quarter" || granularity === "half_year" || granularity === "year") {
        return lib.startOfYear(base);
    }
    return base;
}

/**
 * Two-digit pad (without depending on Intl, which would introduce locale-specific digits). All
 * value strings stay ASCII; locale-aware digit conversion happens only at the display layer via
 * {@link toDisplayDigits}.
 */
function pad(n: number, width = 2): string {
    return String(n).padStart(width, "0");
}

/**
 * Serialise a `Date` in the active calendar to the granularity's canonical value string. The
 * resulting string is what we store on {@link DateFilterValue.value} and what the URL serializer
 * round-trips. Always ASCII — locale-aware digit swapping happens at the display layer only.
 */
export function dateToValueString(date: Date, granularity: Granularity, lib: DateLib): PeriodString {
    const year = lib.getYear(date);
    const month = lib.getMonth(date);
    if (granularity === "day") {
        return `${year}-${pad(month + 1)}-${pad(getDayInMonth(date, lib))}`;
    }
    if (granularity === "month") return `${year}-${pad(month + 1)}`;
    if (granularity === "quarter") return `${year}-Q${getQuarter(date, lib)}`;
    if (granularity === "half_year") return `${year}-H${getHalfYear(date, lib)}`;
    return `${year}`;
}

/**
 * Calendar day-of-month (1-based). `lib.format(date, "d")` would honour the Jalali locale and emit
 * Persian numerals, breaking the ASCII contract — instead we derive the day from a calendar-aware
 * day-difference against the start of the month.
 */
export function getDayInMonth(date: Date, lib: DateLib): number {
    return lib.differenceInCalendarDays(date, lib.startOfMonth(date)) + 1;
}

/**
 * Parse a stored value string back into a `Date` in the given calendar. The returned date anchors
 * on the period's first day; pair with {@link periodEnd} to derive the closing instant.
 */
export function valueStringToDate(
    value: PeriodString,
    granularity: Granularity,
    lib: DateLib,
): Date | null {
    if (granularity === "day") {
        const match = /^(\d{3,4})-(\d{1,2})-(\d{1,2})$/.exec(value);
        if (match === null) return null;
        const [, y, m, d] = match;
        return safeDate(Number(y), Number(m) - 1, Number(d), lib);
    }
    if (granularity === "month") {
        const match = /^(\d{3,4})-(\d{1,2})$/.exec(value);
        if (match === null) return null;
        const [, y, m] = match;
        return safeDate(Number(y), Number(m) - 1, 1, lib);
    }
    if (granularity === "quarter") {
        const match = /^(\d{3,4})-Q([1-4])$/i.exec(value);
        if (match === null) return null;
        const [, y, q] = match;
        return safeDate(Number(y), (Number(q) - 1) * 3, 1, lib);
    }
    if (granularity === "half_year") {
        const match = /^(\d{3,4})-H([12])$/i.exec(value);
        if (match === null) return null;
        const [, y, h] = match;
        return safeDate(Number(y), Number(h) === 1 ? 0 : 6, 1, lib);
    }
    const match = /^(\d{3,4})$/.exec(value);
    if (match === null) return null;
    return safeDate(Number(match[1]), 0, 1, lib);
}

/**
 * Build a calendar-aware `Date` from year/month-zero-indexed/day. Returns null when the components
 * don't round-trip cleanly — guards against e.g. Esfand 30 on a non-leap Jalali year.
 */
function safeDate(year: number, monthZero: number, day: number, lib: DateLib): Date | null {
    const base = lib.startOfDay(lib.setYear(lib.setMonth(lib.today(), monthZero), year));
    const candidate = lib.addDays(lib.startOfMonth(base), day - 1);
    if (
        lib.getYear(candidate) !== year ||
        lib.getMonth(candidate) !== monthZero ||
        getDayInMonth(candidate, lib) !== day
    ) {
        return null;
    }
    return candidate;
}

/**
 * Inclusive end of the period anchored at `start`. Used by toLegacyParams when an endpoint expects
 * `?after=` / `?before=` rather than the unified shape.
 */
export function periodEnd(start: Date, granularity: Granularity, lib: DateLib): Date {
    if (granularity === "day") return start;
    if (granularity === "month") return lib.endOfMonth(start);
    if (granularity === "quarter") return endOfQuarter(start, lib);
    if (granularity === "half_year") return endOfHalfYear(start, lib);
    return lib.endOfYear(start);
}

/**
 * Convert a stored {@link DateFilterValue} into the legacy `after=` / `before=` shape used by API
 * endpoints that haven't migrated to the unified payload. Always emits Gregorian ISO `YYYY-MM-DD`
 * because the API is calendar-agnostic and works in UTC.
 */
export function toLegacyParams(value: {
    operator: "in" | "before" | "after" | "within";
    granularity: Granularity;
    calendar: Calendar;
    value?: PeriodString;
    start?: PeriodString;
    end?: PeriodString;
}): LegacyDateRange {
    const lib = getDateLib(value.calendar);
    if (value.operator === "within" && value.start !== undefined && value.end !== undefined) {
        const start = valueStringToDate(value.start, "day", lib);
        const end = valueStringToDate(value.end, "day", lib);
        if (start === null || end === null) return {};
        return { after: toGregorianISO(start), before: toGregorianISO(end) };
    }
    if (value.value === undefined) return {};
    const anchor = valueStringToDate(value.value, value.granularity, lib);
    if (anchor === null) return {};
    const startDate = anchor;
    const endDate = value.granularity === "day" ? anchor : periodEnd(anchor, value.granularity, lib);
    if (value.operator === "before") return { before: toGregorianISO(startDate) };
    if (value.operator === "after") return { after: toGregorianISO(endDate) };
    return { after: toGregorianISO(startDate), before: toGregorianISO(endDate) };
}

/**
 * Format a `Date` as Gregorian ISO `YYYY-MM-DD` regardless of which calendar produced it. Reads
 * the local-time components so a `Date(2026, 4, 1)` always emits "2026-05-01" — using UTC
 * components would silently shift the date by one in any non-UTC timezone (the picker treats
 * everything as date-only, so a timezone shift is always a bug, not a real time difference).
 */
export function toGregorianISO(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Re-export the underlying class for advanced consumers (custom adapters, tests). Most code only
 * needs {@link getDateLib}.
 */
export { DateLib };
