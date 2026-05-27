import {
    getDateLib,
    periodEnd,
    toGregorianISO,
    valueStringToDate,
} from "#/components/ui/date-picker/date-lib";
import type { DateFilterValue } from "#/components/ui/date-picker/types";

import type { TableViewFilter } from "./types";

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
