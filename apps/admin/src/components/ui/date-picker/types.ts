/**
 * Calendar variants the picker can render. Driven by locale (fa → jalali, en → gregorian) unless a
 * consumer explicitly overrides it.
 */
export type Calendar = "gregorian" | "jalali";

/**
 * Period granularity the operator picks. Day is the only granularity that supports the `within`
 * range operator; the rest collapse to `in | before | after`.
 */
export type Granularity = "day" | "month" | "quarter" | "half_year" | "year";

/**
 * Filter verbs. `in` matches the picked period exactly (only valid for non-day granularities), the
 * range verbs cover open-ended timelines, and `within` is the closed range available on `day` only.
 */
export type Operator = "in" | "before" | "after" | "within";

/**
 * The picker's wire format. Value strings are always written in the active calendar (Gregorian or
 * Jalali) and pair with the `calendar` discriminator so the server / serializer can read them
 * unambiguously.
 *
 * - day:        `YYYY-MM-DD`
 * - month:      `YYYY-MM`
 * - quarter:    `YYYY-Q1`..`YYYY-Q4`
 * - half_year:  `YYYY-H1` | `YYYY-H2`
 * - year:       `YYYY`
 */
export type PeriodString = string;

interface BaseValue {
    calendar: Calendar;
}

export type DateFilterValue =
    | (BaseValue & { operator: "in"; granularity: Exclude<Granularity, "day">; value: PeriodString })
    | (BaseValue & { operator: "before" | "after"; granularity: Granularity; value: PeriodString })
    | (BaseValue & { operator: "within"; granularity: "day"; start: PeriodString; end: PeriodString });

/**
 * Operators that the parser / hook are willing to surface for a given granularity. `in` is omitted
 * for `day` because picking a specific day with `in` collapses to the same UX as `within` of length
 * one — we always express single-day selection as `before | after | within`.
 */
export const ALLOWED_OPERATORS_BY_GRANULARITY: Record<Granularity, Operator[]> = {
    day: ["before", "after", "within"],
    month: ["in", "before", "after"],
    quarter: ["in", "before", "after"],
    half_year: ["in", "before", "after"],
    year: ["in", "before", "after"],
};

/**
 * Default operator picked when the consumer doesn't specify one. `in` is the natural verb for
 * period granularities; `before` is the most common idiom for day-grained filters ("before May 26").
 */
export const DEFAULT_OPERATOR_BY_GRANULARITY: Record<Granularity, Operator> = {
    day: "before",
    month: "in",
    quarter: "in",
    half_year: "in",
    year: "in",
};
