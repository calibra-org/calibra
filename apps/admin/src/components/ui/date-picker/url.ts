import { toLegacyParams } from "./date-lib";
import type { Calendar, DateFilterValue, Granularity, LegacyDateRange, Operator } from "./types";

/**
 * Serialise a {@link DateFilterValue} into its single-URL-parameter form. Examples:
 *   in:2025-Q4        — quarter
 *   in:2025-05        — month
 *   before:2025       — year
 *   before:2025-05-26 — day
 *   within:2025-05-01..2025-05-07 — day range
 *
 * Jalali values are tagged with a `?{key}_cal=jalali` sibling parameter so the server can
 * disambiguate when both calendars share the same shape.
 */
export interface SerializedDateFilter {
    main: string;
    calendar: Calendar;
}

export function serializeDateFilter(value: DateFilterValue): SerializedDateFilter {
    if (value.operator === "within") {
        return { main: `within:${value.start}..${value.end}`, calendar: value.calendar };
    }
    return { main: `${value.operator}:${value.value}`, calendar: value.calendar };
}

/**
 * Inverse of {@link serializeDateFilter}. Returns null on malformed input so the URL never blows
 * up the whole filter strip.
 */
export function parseDateFilter(main: string | null, calendar: Calendar = "gregorian"): DateFilterValue | null {
    if (main === null || main === "") return null;
    const colon = main.indexOf(":");
    if (colon === -1) return null;
    const op = main.slice(0, colon) as Operator;
    const rest = main.slice(colon + 1);
    if (!ALL_OPERATORS.includes(op)) return null;

    if (op === "within") {
        const dotdot = rest.indexOf("..");
        if (dotdot === -1) return null;
        return {
            operator: "within",
            granularity: "day",
            calendar,
            start: rest.slice(0, dotdot),
            end: rest.slice(dotdot + 2),
        };
    }
    const granularity = detectGranularity(rest);
    if (granularity === null) return null;
    if (op === "in") {
        if (granularity === "day") return null;
        return { operator: "in", granularity, calendar, value: rest };
    }
    return { operator: op, granularity, calendar, value: rest };
}

const ALL_OPERATORS: Operator[] = ["in", "before", "after", "within"];

function detectGranularity(s: string): Granularity | null {
    if (/^\d{3,4}-\d{1,2}-\d{1,2}$/.test(s)) return "day";
    if (/^\d{3,4}-Q[1-4]$/i.test(s)) return "quarter";
    if (/^\d{3,4}-H[12]$/i.test(s)) return "half_year";
    if (/^\d{3,4}-\d{1,2}$/.test(s)) return "month";
    if (/^\d{3,4}$/.test(s)) return "year";
    return null;
}

/**
 * Re-export of the canonical legacy bridge so list-page filters can stay backwards-compatible
 * while the API endpoints catch up to the unified shape.
 */
export function toLegacyDateRange(value: DateFilterValue): LegacyDateRange {
    return toLegacyParams(value);
}
