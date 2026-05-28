import { dateToValueString, getDateLib, periodEnd, toGregorianISO, valueStringToDate } from "#/components/ui/date-picker/date-lib";
import type { Calendar, DateFilterValue } from "#/components/ui/date-picker/types";

import type { TableViewFilter, TableViewPrimitive } from "./types";

const END_OF_DAY_SUFFIX = "T23:59:59.999Z";

/**
 * Translate a {@link DateFilterValue} from the date-picker primitive into one
 * {@link TableViewFilter} entry the unified wire grammar accepts. Returns `null` when the value
 * fails to parse — caller should drop the filter rather than send a malformed entry server-side.
 *
 * The bounds we emit are calibrated to match the existing server-side semantics this PR
 * replaces (`apps/api/app/services/date_filter_parser.ts`): the lower bound is the period's
 * first day at midnight (Gregorian), the upper bound is the period's last day at
 * `T23:59:59.999Z`. Jalali years (< 1700) round-trip through `@mohammadxali/jalaali-js` via
 * `getDateLib("jalali") → toGregorianISO`. The server stays calendar-agnostic and never sees a
 * Jalali date string.
 *
 * Mapping:
 *
 *  | DateFilter operator       | TableView op | shape                                              |
 *  |---------------------------|--------------|----------------------------------------------------|
 *  | `before:<period>`         | `lte`        | `[fieldName, "lte", "<periodEnd>"]`                |
 *  | `after:<period>`          | `gte`        | `[fieldName, "gte", "<periodStart>"]`              |
 *  | `in:<period>` (non-day)   | `between`    | `[fieldName, "between", ["<start>", "<end>"]]`     |
 *  | `within:<a>..<b>` (day)   | `between`    | `[fieldName, "between", ["<a>", "<b@eod>"]]`       |
 */
export function dateFilterValueToTableViewFilter(field: string, value: DateFilterValue): TableViewFilter | null {
    const lib = getDateLib(value.calendar);

    if (value.operator === "within") {
        const startDate = valueStringToDate(value.start, "day", lib);
        const endDate = valueStringToDate(value.end, "day", lib);
        if (startDate === null || endDate === null) return null;
        return {
            field,
            op: "between",
            value: [toGregorianISO(startDate), `${toGregorianISO(endDate)}${END_OF_DAY_SUFFIX}`],
        };
    }

    const startDate = valueStringToDate(value.value, value.granularity, lib);
    if (startDate === null) return null;
    const endDate = periodEnd(startDate, value.granularity, lib);

    if (value.operator === "before") {
        return { field, op: "lte", value: `${toGregorianISO(endDate)}${END_OF_DAY_SUFFIX}` };
    }
    if (value.operator === "after") {
        return { field, op: "gte", value: toGregorianISO(startDate) };
    }
    /** operator === "in" — non-day granularity. */
    return {
        field,
        op: "between",
        value: [toGregorianISO(startDate), `${toGregorianISO(endDate)}${END_OF_DAY_SUFFIX}`],
    };
}

/**
 * Inverse of {@link dateFilterValueToTableViewFilter}: recover a {@link DateFilterValue} from a
 * TableView filter entry so a date chip can render straight from the wire — no redundant human URL
 * key alongside the canonical `filter[]`/bounds.
 *
 * The wire is calendar-agnostic Gregorian and carries absolute day bounds, so the recovered value
 * is always a **day-granularity** range (`within` / `after` / `before`). The original *relative*
 * period ("last 30 days") cannot be reconstructed — only the concrete dates it resolved to. The
 * filtered result is identical; only the chip's label differs. Day strings are re-expressed in
 * `calendar` so a Persian operator still sees a Jalali range.
 */
export function tableViewFilterToDateFilterValue(
    filter: TableViewFilter | undefined,
    calendar: Calendar,
): DateFilterValue | null {
    if (filter === undefined) return null;
    if (filter.op === "between") {
        if (!Array.isArray(filter.value) || filter.value.length < 2) return null;
        const start = gregorianDayToCalendar(filter.value[0], calendar);
        const end = gregorianDayToCalendar(filter.value[1], calendar);
        if (start === null || end === null) return null;
        return { operator: "within", granularity: "day", calendar, start, end };
    }
    if (filter.op === "gte") {
        const start = gregorianDayToCalendar(filter.value as TableViewPrimitive, calendar);
        if (start === null) return null;
        return { operator: "after", granularity: "day", calendar, value: start };
    }
    if (filter.op === "lte") {
        const end = gregorianDayToCalendar(filter.value as TableViewPrimitive, calendar);
        if (end === null) return null;
        return { operator: "before", granularity: "day", calendar, value: end };
    }
    return null;
}

/**
 * Recover a {@link DateFilterValue} from an inclusive `after` / `before` ISO bound pair — the shape
 * aggregate date extras (`last_order_after` / `last_order_before`) carry, since those bounds live
 * outside the TableView `filter[]` grammar. Empty strings count as unset. Same Gregorian-day
 * lossiness as {@link tableViewFilterToDateFilterValue}.
 */
export function boundsToDateFilterValue(after: string, before: string, calendar: Calendar): DateFilterValue | null {
    const start = after.length > 0 ? gregorianDayToCalendar(after, calendar) : null;
    const end = before.length > 0 ? gregorianDayToCalendar(before, calendar) : null;
    if (start !== null && end !== null) return { operator: "within", granularity: "day", calendar, start, end };
    if (start !== null) return { operator: "after", granularity: "day", calendar, value: start };
    if (end !== null) return { operator: "before", granularity: "day", calendar, value: end };
    return null;
}

/**
 * Convert a Gregorian `YYYY-MM-DD` wire bound (optionally carrying a `T…` time tail) into a day
 * {@link PeriodString} expressed in `calendar`. Returns `null` for anything that isn't a day-shaped
 * Gregorian date.
 */
function gregorianDayToCalendar(value: TableViewPrimitive, calendar: Calendar): string | null {
    if (typeof value !== "string" || value.length === 0) return null;
    const tIndex = value.indexOf("T");
    const day = tIndex === -1 ? value : value.slice(0, tIndex);
    if (!/^\d{3,4}-\d{1,2}-\d{1,2}$/.test(day)) return null;
    const date = valueStringToDate(day, "day", getDateLib("gregorian"));
    if (date === null) return null;
    return dateToValueString(date, "day", getDateLib(calendar));
}
