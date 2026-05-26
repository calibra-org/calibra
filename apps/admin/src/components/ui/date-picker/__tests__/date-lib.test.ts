import { describe, expect, it } from "vitest";

import {
    buildDateForPeriod,
    calendarForLocale,
    dateToValueString,
    endOfHalfYear,
    endOfQuarter,
    getDateLib,
    getHalfYear,
    getQuarter,
    periodEnd,
    startOfHalfYear,
    startOfQuarter,
    toGregorianISO,
    valueStringToDate,
    weekStartsOnFor,
} from "../date-lib";

describe("calendarForLocale", () => {
    it("maps fa → jalali, en → gregorian", () => {
        expect(calendarForLocale("fa")).toBe("jalali");
        expect(calendarForLocale("en")).toBe("gregorian");
    });
});

describe("weekStartsOnFor", () => {
    it("Saturday for Jalali, Sunday for Gregorian", () => {
        expect(weekStartsOnFor("jalali")).toBe(6);
        expect(weekStartsOnFor("gregorian")).toBe(0);
    });
});

describe("period math — Gregorian", () => {
    const lib = getDateLib("gregorian");

    it("startOfQuarter for May (month 4) returns April 1", () => {
        const may = new Date(2026, 4, 15);
        const q = startOfQuarter(may, lib);
        expect(lib.getMonth(q)).toBe(3);
        expect(lib.getYear(q)).toBe(2026);
    });

    it("endOfQuarter for August (month 7) returns Sept 30", () => {
        const aug = new Date(2026, 7, 10);
        const q = endOfQuarter(aug, lib);
        expect(lib.getMonth(q)).toBe(8);
        expect(lib.getYear(q)).toBe(2026);
    });

    it("startOfHalfYear for August returns July 1", () => {
        const aug = new Date(2026, 7, 10);
        const h = startOfHalfYear(aug, lib);
        expect(lib.getMonth(h)).toBe(6);
    });

    it("endOfHalfYear for February returns June 30", () => {
        const feb = new Date(2026, 1, 14);
        const h = endOfHalfYear(feb, lib);
        expect(lib.getMonth(h)).toBe(5);
    });

    it("getQuarter classifies each month correctly", () => {
        expect(getQuarter(new Date(2026, 0, 1), lib)).toBe(1);
        expect(getQuarter(new Date(2026, 3, 1), lib)).toBe(2);
        expect(getQuarter(new Date(2026, 6, 1), lib)).toBe(3);
        expect(getQuarter(new Date(2026, 9, 1), lib)).toBe(4);
    });

    it("getHalfYear splits at month 6", () => {
        expect(getHalfYear(new Date(2026, 5, 30), lib)).toBe(1);
        expect(getHalfYear(new Date(2026, 6, 1), lib)).toBe(2);
    });
});

describe("period math — Jalali", () => {
    const lib = getDateLib("jalali");

    it("Khordad (Jalali month 2, zero-indexed) sits in Q1", () => {
        const khordad = new Date(2026, 4, 26);
        expect(getQuarter(khordad, lib)).toBe(1);
    });

    it("Mehr (Jalali month 6) starts H2", () => {
        const mehr = lib.setMonth(lib.startOfDay(lib.today()), 6);
        expect(getHalfYear(mehr, lib)).toBe(2);
    });

    it("startOfQuarter for Khordad returns Farvardin 1", () => {
        const khordad5 = new Date(2026, 4, 26);
        const q = startOfQuarter(khordad5, lib);
        expect(lib.getMonth(q)).toBe(0);
    });
});

describe("dateToValueString / valueStringToDate round-trip", () => {
    const lib = getDateLib("gregorian");

    it("day round-trips Gregorian YYYY-MM-DD", () => {
        const d = new Date(2026, 4, 26);
        const s = dateToValueString(d, "day", lib);
        expect(s).toBe("2026-05-26");
        const back = valueStringToDate(s, "day", lib);
        expect(back).not.toBeNull();
        if (back !== null) expect(dateToValueString(back, "day", lib)).toBe(s);
    });

    it("month round-trip", () => {
        const d = new Date(2026, 4, 26);
        const s = dateToValueString(d, "month", lib);
        expect(s).toBe("2026-05");
        const back = valueStringToDate(s, "month", lib);
        expect(back).not.toBeNull();
        if (back !== null) expect(dateToValueString(back, "month", lib)).toBe(s);
    });

    it("quarter round-trip", () => {
        const d = new Date(2026, 9, 12);
        const s = dateToValueString(d, "quarter", lib);
        expect(s).toBe("2026-Q4");
        const back = valueStringToDate(s, "quarter", lib);
        expect(back).not.toBeNull();
        if (back !== null) expect(dateToValueString(back, "quarter", lib)).toBe(s);
    });

    it("half_year round-trip", () => {
        const d = new Date(2026, 9, 12);
        const s = dateToValueString(d, "half_year", lib);
        expect(s).toBe("2026-H2");
        const back = valueStringToDate(s, "half_year", lib);
        expect(back).not.toBeNull();
        if (back !== null) expect(dateToValueString(back, "half_year", lib)).toBe(s);
    });

    it("year round-trip", () => {
        const d = new Date(2026, 4, 26);
        const s = dateToValueString(d, "year", lib);
        expect(s).toBe("2026");
        const back = valueStringToDate(s, "year", lib);
        expect(back).not.toBeNull();
        if (back !== null) expect(dateToValueString(back, "year", lib)).toBe(s);
    });
});

describe("dateToValueString — Jalali ASCII contract", () => {
    const lib = getDateLib("jalali");

    it("emits ASCII digits even when active dateLib uses Persian numerals for display", () => {
        const khordad5 = new Date(2026, 4, 26);
        expect(dateToValueString(khordad5, "day", lib)).toBe("1405-03-05");
        expect(dateToValueString(khordad5, "month", lib)).toBe("1405-03");
        expect(dateToValueString(khordad5, "quarter", lib)).toBe("1405-Q1");
        expect(dateToValueString(khordad5, "half_year", lib)).toBe("1405-H1");
        expect(dateToValueString(khordad5, "year", lib)).toBe("1405");
    });
});

describe("buildDateForPeriod", () => {
    const lib = getDateLib("gregorian");

    it("anchors day-granular at the requested day-of-month", () => {
        const d = buildDateForPeriod("day", 2026, 4, 26, lib);
        expect(dateToValueString(d, "day", lib)).toBe("2026-05-26");
    });

    it("anchors month-granular at day-1", () => {
        const d = buildDateForPeriod("month", 2026, 4, 99, lib);
        expect(dateToValueString(d, "day", lib)).toBe("2026-05-01");
    });
});

describe("periodEnd", () => {
    const lib = getDateLib("gregorian");

    it("day-grained returns the same date", () => {
        const d = new Date(2026, 4, 26);
        expect(periodEnd(d, "day", lib)).toEqual(d);
    });

    it("month-grained returns end of month", () => {
        const d = new Date(2026, 1, 15);
        const end = periodEnd(d, "month", lib);
        expect(lib.getMonth(end)).toBe(1);
        expect(dateToValueString(end, "day", lib)).toBe("2026-02-28");
    });
});

describe("toGregorianISO", () => {
    it("formats a Date as ISO Gregorian date string", () => {
        expect(toGregorianISO(new Date(2026, 4, 26))).toBe("2026-05-26");
    });
});
