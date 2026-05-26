import { test } from "@japa/runner";

import { parseDateFilter } from "#services/date_filter_parser";

test.group("date_filter_parser", () => {
    test("returns null for empty input", ({ assert }) => {
        assert.isNull(parseDateFilter(null));
        assert.isNull(parseDateFilter(undefined));
        assert.isNull(parseDateFilter(""));
    });

    test("returns null for malformed input", ({ assert }) => {
        assert.isNull(parseDateFilter("garbage"));
        assert.isNull(parseDateFilter("in:"));
        assert.isNull(parseDateFilter("in:not-a-period"));
        assert.isNull(parseDateFilter("within:"));
        assert.isNull(parseDateFilter("within:2026-01-01"));
    });

    test("parses `before:YYYY-MM-DD` to a before-only window", ({ assert }) => {
        const result = parseDateFilter("before:2026-05-26");
        assert.isNotNull(result);
        assert.equal(result?.operator, "before");
        assert.isNull(result?.after);
        assert.instanceOf(result?.before, Date);
        assert.equal(result?.before?.getUTCFullYear(), 2026);
        assert.equal(result?.before?.getUTCMonth(), 4);
        assert.equal(result?.before?.getUTCDate(), 26);
    });

    test("parses `after:YYYY-MM-DD` to an after-only window", ({ assert }) => {
        const result = parseDateFilter("after:2026-05-26");
        assert.equal(result?.operator, "after");
        assert.isNull(result?.before);
        assert.instanceOf(result?.after, Date);
    });

    test("parses `in:YYYY-Q1..Q4` to an inclusive quarter window", ({ assert }) => {
        const result = parseDateFilter("in:2026-Q2");
        assert.equal(result?.operator, "in");
        assert.equal(result?.after?.getUTCMonth(), 3);
        assert.equal(result?.before?.getUTCMonth(), 5);
    });

    test("parses `in:YYYY-H1|H2` to an inclusive half-year window", ({ assert }) => {
        const result = parseDateFilter("in:2026-H1");
        assert.equal(result?.after?.getUTCMonth(), 0);
        assert.equal(result?.before?.getUTCMonth(), 5);
    });

    test("parses `in:YYYY-MM` to an inclusive month window", ({ assert }) => {
        const result = parseDateFilter("in:2026-02");
        assert.equal(result?.after?.getUTCMonth(), 1);
        assert.equal(result?.before?.getUTCMonth(), 1);
        assert.equal(result?.before?.getUTCDate(), 28);
    });

    test("parses `in:YYYY` to an inclusive year window", ({ assert }) => {
        const result = parseDateFilter("in:2026");
        assert.equal(result?.after?.getUTCFullYear(), 2026);
        assert.equal(result?.after?.getUTCMonth(), 0);
        assert.equal(result?.before?.getUTCFullYear(), 2026);
        assert.equal(result?.before?.getUTCMonth(), 11);
    });

    test("parses `within:start..end` to a closed range", ({ assert }) => {
        const result = parseDateFilter("within:2026-05-01..2026-05-07");
        assert.equal(result?.operator, "within");
        assert.equal(result?.after?.getUTCDate(), 1);
        assert.equal(result?.before?.getUTCDate(), 7);
    });

    test("treats a year < 1700 as Jalali and converts to Gregorian", ({ assert }) => {
        /** Khordad 5, 1405 = May 26, 2026. */
        const result = parseDateFilter("before:1405-03-05");
        assert.equal(result?.before?.getUTCFullYear(), 2026);
        assert.equal(result?.before?.getUTCMonth(), 4);
        assert.equal(result?.before?.getUTCDate(), 26);
    });

    test("treats a year >= 1700 as Gregorian", ({ assert }) => {
        const result = parseDateFilter("before:2026-05-26");
        assert.equal(result?.before?.getUTCFullYear(), 2026);
    });

    test("Jalali year quarter window converts to Gregorian boundaries", ({ assert }) => {
        const result = parseDateFilter("in:1405-Q1");
        /** Jalali Q1 1405 = Farvardin 1 - Khordad 31 = 2026-03-21 to 2026-06-21. */
        assert.equal(result?.after?.getUTCFullYear(), 2026);
        assert.equal(result?.after?.getUTCMonth(), 2);
        assert.equal(result?.after?.getUTCDate(), 21);
    });
});
