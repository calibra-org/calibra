import { toPersianDigits } from "@calibra/shared/digits";

import { getDateLib, valueStringToDate } from "./date-lib";
import type { Calendar, DateFilterValue } from "./types";

type Locale = "en" | "fa";

/**
 * Locale-aware digit swap. Persian display always renders Persian numerals (۱۴۰۵ rather than 1405)
 * even when the underlying value string is ASCII Jalali; English keeps ASCII digits across
 * calendars.
 */
function toDisplayDigits(s: string, locale: Locale): string {
    return locale === "fa" ? toPersianDigits(s) : s;
}

interface FormatContext {
    locale: Locale;
}

/**
 * Render a {@link DateFilterValue} as the user-facing string the filter chip surfaces. The result
 * is operator + value (e.g. `"before May 2025"`, `"in Q4 1404"`, `"within May 1 – May 7"`); the
 * caller composes the field label.
 */
export function formatDateFilterValue(value: DateFilterValue, ctx: FormatContext): string {
    const operatorLabel = formatOperator(value.operator, ctx.locale);
    const valuePart = formatValueOnly(value, ctx);
    return `${operatorLabel} ${valuePart}`.trim();
}

/**
 * Render just the value portion — what shows in the chip's value segment without the operator
 * prefix. Used by the filter chip's three-segment layout.
 */
export function formatValueOnly(value: DateFilterValue, ctx: FormatContext): string {
    const lib = getDateLib(value.calendar);
    if (value.operator === "within") {
        const start = valueStringToDate(value.start, "day", lib);
        const end = valueStringToDate(value.end, "day", lib);
        if (start === null || end === null) return "";
        return toDisplayDigits(
            `${lib.format(start, withinDateFormat(value.calendar))} – ${lib.format(end, withinDateFormat(value.calendar))}`,
            ctx.locale,
        );
    }
    const anchor = valueStringToDate(value.value, value.granularity, lib);
    if (anchor === null) return "";
    if (value.granularity === "day") {
        return toDisplayDigits(lib.format(anchor, dayFormat(value.calendar)), ctx.locale);
    }
    if (value.granularity === "month") {
        return toDisplayDigits(lib.format(anchor, "MMMM yyyy"), ctx.locale);
    }
    if (value.granularity === "quarter") {
        const q = value.value.match(/Q([1-4])/i)?.[1] ?? "?";
        const year = String(lib.getYear(anchor));
        const head = ctx.locale === "fa" ? `فصل ${q}` : `Q${q}`;
        return toDisplayDigits(`${head} ${year}`, ctx.locale);
    }
    if (value.granularity === "half_year") {
        const h = value.value.match(/H([12])/i)?.[1] ?? "?";
        const year = String(lib.getYear(anchor));
        const head = ctx.locale === "fa" ? `نیم‌سال ${h}` : `H${h}`;
        return toDisplayDigits(`${head} ${year}`, ctx.locale);
    }
    return toDisplayDigits(String(lib.getYear(anchor)), ctx.locale);
}

function dayFormat(calendar: Calendar): string {
    return calendar === "jalali" ? "d MMMM yyyy" : "MMM d, yyyy";
}

function withinDateFormat(calendar: Calendar): string {
    return calendar === "jalali" ? "d MMMM" : "MMM d";
}

/**
 * Translate the operator verb. We keep these inline (rather than going through next-intl) because
 * the formatter runs in pure contexts — URL→chip rehydration, tests, and server-side rendering of
 * filter labels before the i18n provider is in scope.
 */
export function formatOperator(operator: DateFilterValue["operator"], locale: Locale): string {
    if (locale === "fa") {
        if (operator === "before") return "قبل از";
        if (operator === "after") return "بعد از";
        if (operator === "within") return "بین";
        return "در";
    }
    if (operator === "before") return "before";
    if (operator === "after") return "after";
    if (operator === "within") return "within";
    return "in";
}
