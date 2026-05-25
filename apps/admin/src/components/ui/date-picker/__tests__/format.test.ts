import { describe, expect, it } from "vitest";

import { formatDateFilterValue, formatOperator, formatValueOnly } from "../format";
import type { DateFilterValue } from "../types";

describe("formatOperator", () => {
    it("returns English verbs for en locale", () => {
        expect(formatOperator("in", "en")).toBe("in");
        expect(formatOperator("before", "en")).toBe("before");
        expect(formatOperator("after", "en")).toBe("after");
        expect(formatOperator("within", "en")).toBe("within");
    });

    it("returns Persian verbs for fa locale", () => {
        expect(formatOperator("in", "fa")).toBe("در");
        expect(formatOperator("before", "fa")).toBe("قبل از");
        expect(formatOperator("after", "fa")).toBe("بعد از");
        expect(formatOperator("within", "fa")).toBe("بین");
    });
});

describe("formatDateFilterValue — Gregorian", () => {
    it("formats `in` quarter (en)", () => {
        const value: DateFilterValue = {
            operator: "in",
            granularity: "quarter",
            calendar: "gregorian",
            value: "2025-Q4",
        };
        expect(formatDateFilterValue(value, { locale: "en" })).toBe("in Q4 2025");
    });

    it("formats `before` month (en)", () => {
        const value: DateFilterValue = {
            operator: "before",
            granularity: "month",
            calendar: "gregorian",
            value: "2026-05",
        };
        expect(formatDateFilterValue(value, { locale: "en" })).toContain("before");
        expect(formatDateFilterValue(value, { locale: "en" })).toContain("2026");
    });

    it("formats `within` day range (en)", () => {
        const value: DateFilterValue = {
            operator: "within",
            granularity: "day",
            calendar: "gregorian",
            start: "2026-05-01",
            end: "2026-05-07",
        };
        const formatted = formatDateFilterValue(value, { locale: "en" });
        expect(formatted).toContain("within");
        expect(formatted).toContain("May");
        expect(formatted).toContain("1");
        expect(formatted).toContain("7");
    });

    it("formats year (en)", () => {
        const value: DateFilterValue = {
            operator: "after",
            granularity: "year",
            calendar: "gregorian",
            value: "2024",
        };
        expect(formatDateFilterValue(value, { locale: "en" })).toBe("after 2024");
    });
});

describe("formatDateFilterValue — Jalali / Persian display", () => {
    it("renders Persian digits for fa locale", () => {
        const value: DateFilterValue = {
            operator: "in",
            granularity: "year",
            calendar: "jalali",
            value: "1405",
        };
        const formatted = formatDateFilterValue(value, { locale: "fa" });
        expect(formatted).toContain("در");
        expect(formatted).toContain("۱۴۰۵");
    });

    it("renders Jalali quarter in Persian", () => {
        const value: DateFilterValue = {
            operator: "in",
            granularity: "quarter",
            calendar: "jalali",
            value: "1405-Q4",
        };
        const formatted = formatDateFilterValue(value, { locale: "fa" });
        expect(formatted).toContain("Q۴");
        expect(formatted).toContain("۱۴۰۵");
    });

    it("renders Jalali half-year in Persian", () => {
        const value: DateFilterValue = {
            operator: "in",
            granularity: "half_year",
            calendar: "jalali",
            value: "1405-H1",
        };
        const formatted = formatDateFilterValue(value, { locale: "fa" });
        expect(formatted).toContain("H۱");
        expect(formatted).toContain("۱۴۰۵");
    });
});

describe("formatValueOnly", () => {
    it("returns just the value part without the operator prefix", () => {
        const value: DateFilterValue = {
            operator: "in",
            granularity: "quarter",
            calendar: "gregorian",
            value: "2025-Q4",
        };
        expect(formatValueOnly(value, { locale: "en" })).toBe("Q4 2025");
    });

    it("returns just the year for year granularity", () => {
        const value: DateFilterValue = {
            operator: "after",
            granularity: "year",
            calendar: "gregorian",
            value: "2024",
        };
        expect(formatValueOnly(value, { locale: "en" })).toBe("2024");
    });
});
