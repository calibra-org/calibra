import { describe, expect, test } from "vitest";

import { boundsToDateFilterValue, dateFilterValueToTableViewFilter, tableViewFilterToDateFilterValue } from "./date-adapter";

/**
 * The adapter is the seam between the date-picker primitive's rich operator vocabulary (`in` /
 * `before` / `after` / `within`) and the unified wire grammar's smaller set (`gte` / `lte` /
 * `between`). These cases assert the boundary semantics that the existing server-side parser
 * established — date-only lower bounds + end-of-day upper bounds — so server behaviour does not
 * silently change when its `parseDateFilter` service goes away in this PR.
 */

describe("dateFilterValueToTableViewFilter / Gregorian calendar", () => {
    test("`before:<day>` maps to lte at end-of-day", () => {
        const filter = dateFilterValueToTableViewFilter("created_at", {
            calendar: "gregorian",
            operator: "before",
            granularity: "day",
            value: "2026-05-26",
        });
        expect(filter).toEqual({
            field: "created_at",
            op: "lte",
            value: "2026-05-26T23:59:59.999Z",
        });
    });

    test("`after:<day>` maps to gte at midnight", () => {
        const filter = dateFilterValueToTableViewFilter("created_at", {
            calendar: "gregorian",
            operator: "after",
            granularity: "day",
            value: "2026-05-26",
        });
        expect(filter).toEqual({
            field: "created_at",
            op: "gte",
            value: "2026-05-26",
        });
    });

    test("`in:<month>` maps to between covering the month", () => {
        const filter = dateFilterValueToTableViewFilter("created_at", {
            calendar: "gregorian",
            operator: "in",
            granularity: "month",
            value: "2026-02",
        });
        expect(filter).toEqual({
            field: "created_at",
            op: "between",
            value: ["2026-02-01", "2026-02-28T23:59:59.999Z"],
        });
    });

    test("`in:<quarter>` covers the quarter end-to-end", () => {
        const filter = dateFilterValueToTableViewFilter("created_at", {
            calendar: "gregorian",
            operator: "in",
            granularity: "quarter",
            value: "2026-Q2",
        });
        expect(filter).toEqual({
            field: "created_at",
            op: "between",
            value: ["2026-04-01", "2026-06-30T23:59:59.999Z"],
        });
    });

    test("`in:<half_year>` covers a six-month span", () => {
        const filter = dateFilterValueToTableViewFilter("created_at", {
            calendar: "gregorian",
            operator: "in",
            granularity: "half_year",
            value: "2026-H1",
        });
        expect(filter).toEqual({
            field: "created_at",
            op: "between",
            value: ["2026-01-01", "2026-06-30T23:59:59.999Z"],
        });
    });

    test("`in:<year>` covers the calendar year", () => {
        const filter = dateFilterValueToTableViewFilter("created_at", {
            calendar: "gregorian",
            operator: "in",
            granularity: "year",
            value: "2026",
        });
        expect(filter).toEqual({
            field: "created_at",
            op: "between",
            value: ["2026-01-01", "2026-12-31T23:59:59.999Z"],
        });
    });

    test("`within:<a>..<b>` maps to between with end-of-day upper bound", () => {
        const filter = dateFilterValueToTableViewFilter("created_at", {
            calendar: "gregorian",
            operator: "within",
            granularity: "day",
            start: "2026-05-01",
            end: "2026-05-07",
        });
        expect(filter).toEqual({
            field: "created_at",
            op: "between",
            value: ["2026-05-01", "2026-05-07T23:59:59.999Z"],
        });
    });

    test("returns null for an unparseable value", () => {
        const filter = dateFilterValueToTableViewFilter("created_at", {
            calendar: "gregorian",
            operator: "before",
            granularity: "day",
            value: "not-a-date",
        });
        expect(filter).toBeNull();
    });
});

describe("dateFilterValueToTableViewFilter / Jalali calendar", () => {
    test("`in:<jalali year>` converts to Gregorian boundaries", () => {
        const filter = dateFilterValueToTableViewFilter("created_at", {
            calendar: "jalali",
            operator: "in",
            granularity: "year",
            value: "1405",
        });
        /** 1405 begins on 2026-03-21 and ends on 2027-03-20. */
        expect(filter).not.toBeNull();
        expect(filter?.op).toBe("between");
        const bounds = filter?.value as readonly [string, string];
        expect(bounds[0]).toBe("2026-03-21");
        expect(bounds[1]).toBe("2027-03-20T23:59:59.999Z");
    });

    test("`within` over Jalali days produces Gregorian ISO bounds", () => {
        const filter = dateFilterValueToTableViewFilter("created_at", {
            calendar: "jalali",
            operator: "within",
            granularity: "day",
            start: "1405-01-01",
            end: "1405-01-07",
        });
        const bounds = filter?.value as readonly [string, string];
        expect(bounds[0]).toBe("2026-03-21");
        expect(bounds[1]).toBe("2026-03-27T23:59:59.999Z");
    });
});

/**
 * The inverse direction (wire → picker) recovers a day-granularity {@link DateFilterValue} so a
 * date chip can render straight from the canonical `filter[]` / bounds — no redundant human URL
 * key. It is intentionally lossy: a relative period collapses to the absolute days it resolved to.
 */
describe("tableViewFilterToDateFilterValue (wire → picker)", () => {
    test("`between` recovers a Gregorian `within` day range, stripping the end-of-day time", () => {
        expect(
            tableViewFilterToDateFilterValue(
                { field: "created_at", op: "between", value: ["2026-05-01", "2026-05-31T23:59:59.999Z"] },
                "gregorian",
            ),
        ).toEqual({ operator: "within", granularity: "day", calendar: "gregorian", start: "2026-05-01", end: "2026-05-31" });
    });

    test("`gte` recovers `after`, `lte` recovers `before`", () => {
        expect(tableViewFilterToDateFilterValue({ field: "created_at", op: "gte", value: "2026-05-26" }, "gregorian")).toEqual({
            operator: "after",
            granularity: "day",
            calendar: "gregorian",
            value: "2026-05-26",
        });
        expect(
            tableViewFilterToDateFilterValue({ field: "created_at", op: "lte", value: "2026-05-26T23:59:59.999Z" }, "gregorian"),
        ).toEqual({ operator: "before", granularity: "day", calendar: "gregorian", value: "2026-05-26" });
    });

    test("undefined / non-date ops recover null", () => {
        expect(tableViewFilterToDateFilterValue(undefined, "gregorian")).toBeNull();
        expect(tableViewFilterToDateFilterValue({ field: "status", op: "eq", value: "active" }, "gregorian")).toBeNull();
    });

    test("round-trips a Gregorian `within` range through both adapters", () => {
        const wire = dateFilterValueToTableViewFilter("created_at", {
            calendar: "gregorian",
            operator: "within",
            granularity: "day",
            start: "2026-03-01",
            end: "2026-03-15",
        });
        expect(tableViewFilterToDateFilterValue(wire ?? undefined, "gregorian")).toEqual({
            operator: "within",
            granularity: "day",
            calendar: "gregorian",
            start: "2026-03-01",
            end: "2026-03-15",
        });
    });
});

describe("boundsToDateFilterValue (aggregate after/before → picker)", () => {
    test("both bounds → `within`", () => {
        expect(boundsToDateFilterValue("2026-01-01", "2026-01-31T23:59:59.999Z", "gregorian")).toEqual({
            operator: "within",
            granularity: "day",
            calendar: "gregorian",
            start: "2026-01-01",
            end: "2026-01-31",
        });
    });

    test("only `after` → `after`; only `before` → `before`; neither → null", () => {
        expect(boundsToDateFilterValue("2026-01-01", "", "gregorian")).toMatchObject({ operator: "after", value: "2026-01-01" });
        expect(boundsToDateFilterValue("", "2026-01-31", "gregorian")).toMatchObject({ operator: "before", value: "2026-01-31" });
        expect(boundsToDateFilterValue("", "", "gregorian")).toBeNull();
    });
});
