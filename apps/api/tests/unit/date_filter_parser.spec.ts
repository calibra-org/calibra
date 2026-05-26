import { test } from "@japa/runner";

import { parseDateFilter } from "#services/date_filter_parser";

test.group("date_filter_parser", () => {
    test("returns null for empty input", ({ expect }) => {
        expect(parseDateFilter(null)).toBeNull();
        expect(parseDateFilter(undefined)).toBeNull();
        expect(parseDateFilter("")).toBeNull();
    });

    test("returns null for malformed input", ({ expect }) => {
        expect(parseDateFilter("garbage")).toBeNull();
        expect(parseDateFilter("in:")).toBeNull();
        expect(parseDateFilter("in:not-a-period")).toBeNull();
        expect(parseDateFilter("within:")).toBeNull();
        expect(parseDateFilter("within:2026-01-01")).toBeNull();
    });

    test("parses `before:YYYY-MM-DD` to a before-only window", ({ expect }) => {
        const result = parseDateFilter("before:2026-05-26");
        expect(result).not.toBeNull();
        expect(result?.operator).toBe("before");
        expect(result?.after).toBeNull();
        expect(result?.before).toBeInstanceOf(Date);
        expect(result?.before?.getUTCFullYear()).toBe(2026);
        expect(result?.before?.getUTCMonth()).toBe(4);
        expect(result?.before?.getUTCDate()).toBe(26);
    });

    test("parses `after:YYYY-MM-DD` to an after-only window", ({ expect }) => {
        const result = parseDateFilter("after:2026-05-26");
        expect(result?.operator).toBe("after");
        expect(result?.before).toBeNull();
        expect(result?.after).toBeInstanceOf(Date);
    });

    test("parses `in:YYYY-Q1..Q4` to an inclusive quarter window", ({ expect }) => {
        const result = parseDateFilter("in:2026-Q2");
        expect(result?.operator).toBe("in");
        expect(result?.after?.getUTCMonth()).toBe(3);
        expect(result?.before?.getUTCMonth()).toBe(5);
    });

    test("parses `in:YYYY-H1|H2` to an inclusive half-year window", ({ expect }) => {
        const result = parseDateFilter("in:2026-H1");
        expect(result?.after?.getUTCMonth()).toBe(0);
        expect(result?.before?.getUTCMonth()).toBe(5);
    });

    test("parses `in:YYYY-MM` to an inclusive month window", ({ expect }) => {
        const result = parseDateFilter("in:2026-02");
        expect(result?.after?.getUTCMonth()).toBe(1);
        expect(result?.before?.getUTCMonth()).toBe(1);
        expect(result?.before?.getUTCDate()).toBe(28);
    });

    test("parses `in:YYYY` to an inclusive year window", ({ expect }) => {
        const result = parseDateFilter("in:2026");
        expect(result?.after?.getUTCFullYear()).toBe(2026);
        expect(result?.after?.getUTCMonth()).toBe(0);
        expect(result?.before?.getUTCFullYear()).toBe(2026);
        expect(result?.before?.getUTCMonth()).toBe(11);
    });

    test("parses `within:start..end` to a closed range", ({ expect }) => {
        const result = parseDateFilter("within:2026-05-01..2026-05-07");
        expect(result?.operator).toBe("within");
        expect(result?.after?.getUTCDate()).toBe(1);
        expect(result?.before?.getUTCDate()).toBe(7);
    });

    test("treats a year < 1700 as Jalali and converts to Gregorian", ({ expect }) => {
        /** Khordad 5, 1405 = May 26, 2026. */
        const result = parseDateFilter("before:1405-03-05");
        expect(result?.before?.getUTCFullYear()).toBe(2026);
        expect(result?.before?.getUTCMonth()).toBe(4);
        expect(result?.before?.getUTCDate()).toBe(26);
    });

    test("treats a year >= 1700 as Gregorian", ({ expect }) => {
        const result = parseDateFilter("before:2026-05-26");
        expect(result?.before?.getUTCFullYear()).toBe(2026);
    });

    test("Jalali year quarter window converts to Gregorian boundaries", ({ expect }) => {
        const result = parseDateFilter("in:1405-Q1");
        /** Jalali Q1 1405 = Farvardin 1 - Khordad 31 = 2026-03-21 to 2026-06-21. */
        expect(result?.after?.getUTCFullYear()).toBe(2026);
        expect(result?.after?.getUTCMonth()).toBe(2);
        expect(result?.after?.getUTCDate()).toBe(21);
    });
});
