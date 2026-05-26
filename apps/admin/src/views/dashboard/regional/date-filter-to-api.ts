import {
    getDateLib,
    periodEnd,
    valueStringToDate,
    type DateFilterValue,
} from "#/components/ui/date-picker";

/**
 * Convert a controlled `DateFilterValue` from the admin date-picker into the `{from, to}`
 * Gregorian ISO query the regional insights API consumes. Empty / unfinished inputs collapse
 * to `{}` so the server applies its trailing-30-day default.
 *
 * Mapping:
 *   - `within day [start, end]` → `[start day 00:00 UTC, end day 24:00 UTC)`
 *   - `in <period>`             → period bounds via `periodEnd`
 *   - `before <period>`         → upper-bound only
 *   - `after <period>`          → lower-bound only (set to the period's exclusive end)
 */
export function dateFilterToApi(value: DateFilterValue | null): { from?: string; to?: string } {
    if (value === null) return {};
    const lib = getDateLib(value.calendar);

    if (value.operator === "within") {
        const start = valueStringToDate(value.start, "day", lib);
        const end = valueStringToDate(value.end, "day", lib);
        if (start === null || end === null) return {};
        const endExclusive = new Date(end);
        endExclusive.setDate(endExclusive.getDate() + 1);
        return { from: start.toISOString(), to: endExclusive.toISOString() };
    }
    if (value.operator === "in") {
        const start = valueStringToDate(value.value, value.granularity, lib);
        if (start === null) return {};
        return { from: start.toISOString(), to: periodEnd(start, value.granularity, lib).toISOString() };
    }
    if (value.operator === "before") {
        const start = valueStringToDate(value.value, value.granularity, lib);
        if (start === null) return {};
        return { to: start.toISOString() };
    }
    if (value.operator === "after") {
        const start = valueStringToDate(value.value, value.granularity, lib);
        if (start === null) return {};
        return { from: periodEnd(start, value.granularity, lib).toISOString() };
    }
    return {};
}
