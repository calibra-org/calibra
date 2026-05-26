import { describe, expect, it } from "vitest";

import type { DateFilterValue } from "../types";
import { parseDateFilter, serializeDateFilter } from "../url";

describe("serializeDateFilter", () => {
    it("encodes `in` quarter as op:value", () => {
        const value: DateFilterValue = {
            operator: "in",
            granularity: "quarter",
            calendar: "gregorian",
            value: "2025-Q4",
        };
        expect(serializeDateFilter(value)).toEqual({ main: "in:2025-Q4", calendar: "gregorian" });
    });

    it("encodes `before` day as op:value", () => {
        const value: DateFilterValue = {
            operator: "before",
            granularity: "day",
            calendar: "gregorian",
            value: "2026-05-26",
        };
        expect(serializeDateFilter(value)).toEqual({ main: "before:2026-05-26", calendar: "gregorian" });
    });

    it("encodes `within` day range as op:start..end", () => {
        const value: DateFilterValue = {
            operator: "within",
            granularity: "day",
            calendar: "gregorian",
            start: "2026-05-01",
            end: "2026-05-07",
        };
        expect(serializeDateFilter(value)).toEqual({ main: "within:2026-05-01..2026-05-07", calendar: "gregorian" });
    });

    it("passes Jalali calendar through unchanged", () => {
        const value: DateFilterValue = {
            operator: "in",
            granularity: "year",
            calendar: "jalali",
            value: "1405",
        };
        expect(serializeDateFilter(value)).toEqual({ main: "in:1405", calendar: "jalali" });
    });
});

describe("parseDateFilter", () => {
    it("round-trips a quarter value", () => {
        const input = "in:2025-Q4";
        const parsed = parseDateFilter(input);
        expect(parsed).toEqual({ operator: "in", granularity: "quarter", calendar: "gregorian", value: "2025-Q4" });
    });

    it("round-trips a day value", () => {
        const parsed = parseDateFilter("before:2026-05-26");
        expect(parsed).toEqual({ operator: "before", granularity: "day", calendar: "gregorian", value: "2026-05-26" });
    });

    it("round-trips a within range", () => {
        const parsed = parseDateFilter("within:2026-05-01..2026-05-07");
        expect(parsed).toEqual({
            operator: "within",
            granularity: "day",
            calendar: "gregorian",
            start: "2026-05-01",
            end: "2026-05-07",
        });
    });

    it("round-trips a year value", () => {
        const parsed = parseDateFilter("after:2024");
        expect(parsed).toEqual({ operator: "after", granularity: "year", calendar: "gregorian", value: "2024" });
    });

    it("returns null for empty or null input", () => {
        expect(parseDateFilter("")).toBeNull();
        expect(parseDateFilter(null)).toBeNull();
    });

    it("returns null for malformed input", () => {
        expect(parseDateFilter("garbage")).toBeNull();
        expect(parseDateFilter("in:")).toBeNull();
        expect(parseDateFilter("in:not-a-period")).toBeNull();
    });

    it("rejects `in` operator on day granularity", () => {
        expect(parseDateFilter("in:2026-05-26")).toBeNull();
    });

    it("honours the calendar discriminator", () => {
        const parsed = parseDateFilter("in:1405-Q4", "jalali");
        expect(parsed).toMatchObject({ calendar: "jalali", value: "1405-Q4" });
    });
});

describe("URL round-trip", () => {
    const samples: DateFilterValue[] = [
        { operator: "in", granularity: "quarter", calendar: "gregorian", value: "2025-Q4" },
        { operator: "in", granularity: "month", calendar: "gregorian", value: "2026-05" },
        { operator: "in", granularity: "half_year", calendar: "jalali", value: "1405-H1" },
        { operator: "in", granularity: "year", calendar: "jalali", value: "1405" },
        { operator: "before", granularity: "day", calendar: "gregorian", value: "2026-05-26" },
        { operator: "after", granularity: "year", calendar: "gregorian", value: "2024" },
        {
            operator: "within",
            granularity: "day",
            calendar: "jalali",
            start: "1405-03-02",
            end: "1405-03-08",
        },
    ];

    for (const sample of samples) {
        const { main, calendar } = serializeDateFilter(sample);
        it(`round-trips ${main} (${calendar})`, () => {
            expect(parseDateFilter(main, calendar)).toEqual(sample);
        });
    }
});
