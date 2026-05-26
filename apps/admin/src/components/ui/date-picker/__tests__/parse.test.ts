import { describe, expect, it } from "vitest";

import { parseDateFilterInput } from "../parse";

/**
 * Frozen `now` used across the suite. May 26 2026 Gregorian ↔ Khordad 5 1405 Jalali. Constructed
 * with the local-time `Date` ctor so the same calendar date holds regardless of host timezone —
 * `Date.UTC` would otherwise shift to May 25 in negative offsets.
 */
const FROZEN_NOW = new Date(2026, 4, 26, 12, 0, 0);

describe("parser — empty + invalid", () => {
    it("returns 'empty' for empty string", () => {
        expect(parseDateFilterInput("", { locale: "en", calendar: "gregorian" })).toEqual({ error: "empty" });
    });

    it("returns 'empty' for whitespace-only", () => {
        expect(parseDateFilterInput("   ", { locale: "en", calendar: "gregorian" })).toEqual({ error: "empty" });
        expect(parseDateFilterInput("\t\n  ", { locale: "fa", calendar: "jalali" })).toEqual({ error: "empty" });
    });

    it("returns 'invalid' for unrecognised input", () => {
        expect(parseDateFilterInput("asdfasdf", { locale: "en", calendar: "gregorian" })).toEqual({ error: "invalid" });
        expect(parseDateFilterInput("¯\\_(ツ)_/¯", { locale: "fa", calendar: "jalali" })).toEqual({ error: "invalid" });
    });

    it("returns 'ambiguous' for 1–2 digit numbers", () => {
        expect(parseDateFilterInput("5", { locale: "en", calendar: "gregorian" })).toEqual({ error: "ambiguous" });
        expect(parseDateFilterInput("27", { locale: "en", calendar: "gregorian" })).toEqual({ error: "ambiguous" });
        expect(parseDateFilterInput("۲۷", { locale: "fa", calendar: "jalali" })).toEqual({ error: "ambiguous" });
    });
});

describe("parser — Persian digit normalisation", () => {
    it("normalises Persian digits before ISO date match", () => {
        expect(parseDateFilterInput("۲۰۲۶-۰۵-۲۶", { locale: "en", calendar: "gregorian" })).toEqual({
            selection: { kind: "period", granularity: "day", value: "2026-05-26" },
            granularityHint: "day",
        });
    });

    it("normalises Arabic-Indic digits", () => {
        expect(parseDateFilterInput("٢٠٢٦-٠٥-٢٦", { locale: "en", calendar: "gregorian" })).toEqual({
            selection: { kind: "period", granularity: "day", value: "2026-05-26" },
            granularityHint: "day",
        });
    });

    it("normalises Persian digits in Jalali ISO date", () => {
        expect(parseDateFilterInput("۱۴۰۵-۰۲-۳۰", { locale: "fa", calendar: "jalali" })).toEqual({
            selection: { kind: "period", granularity: "day", value: "1405-02-30" },
            granularityHint: "day",
        });
    });

    it("normalises Persian digits in quarter token", () => {
        expect(parseDateFilterInput("Q۴ ۱۴۰۵", { locale: "fa", calendar: "jalali" })).toEqual({
            selection: { kind: "period", granularity: "quarter", value: "1405-Q4" },
            granularityHint: "quarter",
        });
    });
});

describe("parser — ISO date", () => {
    it("parses Gregorian YYYY-MM-DD", () => {
        expect(parseDateFilterInput("2026-05-26", { locale: "en", calendar: "gregorian" })).toEqual({
            selection: { kind: "period", granularity: "day", value: "2026-05-26" },
            granularityHint: "day",
        });
    });

    it("parses Jalali YYYY-MM-DD with calendar=jalali", () => {
        expect(parseDateFilterInput("1405-02-30", { locale: "fa", calendar: "jalali" })).toEqual({
            selection: { kind: "period", granularity: "day", value: "1405-02-30" },
            granularityHint: "day",
        });
    });

    it("pads single-digit month/day", () => {
        expect(parseDateFilterInput("2026-5-3", { locale: "en", calendar: "gregorian" })).toEqual({
            selection: { kind: "period", granularity: "day", value: "2026-05-03" },
            granularityHint: "day",
        });
    });

    it("rejects out-of-range Gregorian date (Feb 31)", () => {
        const result = parseDateFilterInput("2026-02-31", { locale: "en", calendar: "gregorian" });
        expect(result).toEqual({ error: "invalid" });
    });

    it("rejects out-of-range Jalali date (Esfand 30 on non-leap year)", () => {
        const result = parseDateFilterInput("1404-12-30", { locale: "fa", calendar: "jalali" });
        expect(result).toEqual({ error: "invalid" });
    });
});

describe("parser — ISO month", () => {
    it("parses Gregorian YYYY-MM", () => {
        expect(parseDateFilterInput("2026-05", { locale: "en", calendar: "gregorian" })).toEqual({
            selection: { kind: "period", granularity: "month", value: "2026-05" },
            granularityHint: "month",
        });
    });

    it("parses Jalali YYYY-MM", () => {
        expect(parseDateFilterInput("1405-02", { locale: "fa", calendar: "jalali" })).toEqual({
            selection: { kind: "period", granularity: "month", value: "1405-02" },
            granularityHint: "month",
        });
    });

    it("rejects month > 12", () => {
        expect(parseDateFilterInput("2026-13", { locale: "en", calendar: "gregorian" })).toEqual({ error: "invalid" });
    });
});

describe("parser — ISO year", () => {
    it("parses 4-digit year", () => {
        expect(parseDateFilterInput("2026", { locale: "en", calendar: "gregorian" })).toEqual({
            selection: { kind: "period", granularity: "year", value: "2026" },
            granularityHint: "year",
        });
    });

    it("parses Jalali year", () => {
        expect(parseDateFilterInput("1405", { locale: "fa", calendar: "jalali" })).toEqual({
            selection: { kind: "period", granularity: "year", value: "1405" },
            granularityHint: "year",
        });
    });

    it("parses Persian-digit year", () => {
        expect(parseDateFilterInput("۱۴۰۵", { locale: "fa", calendar: "jalali" })).toEqual({
            selection: { kind: "period", granularity: "year", value: "1405" },
            granularityHint: "year",
        });
    });

    it("parses 3-digit year (still treated as a year)", () => {
        expect(parseDateFilterInput("999", { locale: "en", calendar: "gregorian" })).toEqual({
            selection: { kind: "period", granularity: "year", value: "999" },
            granularityHint: "year",
        });
    });
});

describe("parser — Quarter", () => {
    it("parses bare Q1 / Q2 / Q3 / Q4 with current year (en/Gregorian)", () => {
        const ctx = { locale: "en" as const, calendar: "gregorian" as const, now: FROZEN_NOW };
        expect(parseDateFilterInput("Q1", ctx)).toEqual({
            selection: { kind: "period", granularity: "quarter", value: "2026-Q1" },
            granularityHint: "quarter",
        });
        expect(parseDateFilterInput("Q4", ctx)).toEqual({
            selection: { kind: "period", granularity: "quarter", value: "2026-Q4" },
            granularityHint: "quarter",
        });
    });

    it("parses bare Q1 with Jalali current year", () => {
        expect(parseDateFilterInput("Q1", { locale: "fa", calendar: "jalali", now: FROZEN_NOW })).toEqual({
            selection: { kind: "period", granularity: "quarter", value: "1405-Q1" },
            granularityHint: "quarter",
        });
    });

    it("parses 'Q4 2025'", () => {
        expect(parseDateFilterInput("Q4 2025", { locale: "en", calendar: "gregorian" })).toEqual({
            selection: { kind: "period", granularity: "quarter", value: "2025-Q4" },
            granularityHint: "quarter",
        });
    });

    it("parses 'Q4 1405'", () => {
        expect(parseDateFilterInput("Q4 1405", { locale: "fa", calendar: "jalali" })).toEqual({
            selection: { kind: "period", granularity: "quarter", value: "1405-Q4" },
            granularityHint: "quarter",
        });
    });

    it("parses 'YYYY-Q4'", () => {
        expect(parseDateFilterInput("2025-Q4", { locale: "en", calendar: "gregorian" })).toEqual({
            selection: { kind: "period", granularity: "quarter", value: "2025-Q4" },
            granularityHint: "quarter",
        });
    });

    it("parses 'YYYY/Q4'", () => {
        expect(parseDateFilterInput("2025/Q4", { locale: "en", calendar: "gregorian" })).toEqual({
            selection: { kind: "period", granularity: "quarter", value: "2025-Q4" },
            granularityHint: "quarter",
        });
    });

    it("parses '2025 Q4'", () => {
        expect(parseDateFilterInput("2025 Q4", { locale: "en", calendar: "gregorian" })).toEqual({
            selection: { kind: "period", granularity: "quarter", value: "2025-Q4" },
            granularityHint: "quarter",
        });
    });

    it("is case-insensitive", () => {
        expect(parseDateFilterInput("q3 2025", { locale: "en", calendar: "gregorian" })).toEqual({
            selection: { kind: "period", granularity: "quarter", value: "2025-Q3" },
            granularityHint: "quarter",
        });
    });
});

describe("parser — Half-year", () => {
    it("parses bare H1 / H2 with current year", () => {
        const ctx = { locale: "en" as const, calendar: "gregorian" as const, now: FROZEN_NOW };
        expect(parseDateFilterInput("H1", ctx)).toEqual({
            selection: { kind: "period", granularity: "half_year", value: "2026-H1" },
            granularityHint: "half_year",
        });
        expect(parseDateFilterInput("H2", ctx)).toEqual({
            selection: { kind: "period", granularity: "half_year", value: "2026-H2" },
            granularityHint: "half_year",
        });
    });

    it("parses 'YYYY-H1'", () => {
        expect(parseDateFilterInput("2025-H1", { locale: "en", calendar: "gregorian" })).toEqual({
            selection: { kind: "period", granularity: "half_year", value: "2025-H1" },
            granularityHint: "half_year",
        });
    });

    it("parses 'H2 2027'", () => {
        expect(parseDateFilterInput("H2 2027", { locale: "en", calendar: "gregorian" })).toEqual({
            selection: { kind: "period", granularity: "half_year", value: "2027-H2" },
            granularityHint: "half_year",
        });
    });

    it("parses Jalali 'YYYY-H1'", () => {
        expect(parseDateFilterInput("1405-H1", { locale: "fa", calendar: "jalali" })).toEqual({
            selection: { kind: "period", granularity: "half_year", value: "1405-H1" },
            granularityHint: "half_year",
        });
    });
});

describe("parser — Slash date (locale-aware)", () => {
    it("parses MM/DD/YYYY for en", () => {
        expect(parseDateFilterInput("05/26/2026", { locale: "en", calendar: "gregorian" })).toEqual({
            selection: { kind: "period", granularity: "day", value: "2026-05-26" },
            granularityHint: "day",
        });
    });

    it("parses DD/MM/YYYY for fa", () => {
        expect(parseDateFilterInput("30/02/1405", { locale: "fa", calendar: "jalali" })).toEqual({
            selection: { kind: "period", granularity: "day", value: "1405-02-30" },
            granularityHint: "day",
        });
    });

    it("parses YYYY/MM/DD regardless of locale", () => {
        expect(parseDateFilterInput("2026/05/26", { locale: "en", calendar: "gregorian" })).toEqual({
            selection: { kind: "period", granularity: "day", value: "2026-05-26" },
            granularityHint: "day",
        });
        expect(parseDateFilterInput("1405/02/30", { locale: "fa", calendar: "jalali" })).toEqual({
            selection: { kind: "period", granularity: "day", value: "1405-02-30" },
            granularityHint: "day",
        });
    });

    it("rejects ambiguous 2-digit years", () => {
        expect(parseDateFilterInput("05/26/26", { locale: "en", calendar: "gregorian" })).toEqual({ error: "invalid" });
    });

    it("normalises Persian digits in slash dates", () => {
        expect(parseDateFilterInput("۳۰/۰۲/۱۴۰۵", { locale: "fa", calendar: "jalali" })).toEqual({
            selection: { kind: "period", granularity: "day", value: "1405-02-30" },
            granularityHint: "day",
        });
    });
});

describe("parser — Named month (English)", () => {
    it("parses 'May 2027'", () => {
        expect(parseDateFilterInput("May 2027", { locale: "en", calendar: "gregorian" })).toEqual({
            selection: { kind: "period", granularity: "month", value: "2027-05" },
            granularityHint: "month",
        });
    });

    it("parses short month names ('Jan 2026')", () => {
        expect(parseDateFilterInput("Jan 2026", { locale: "en", calendar: "gregorian" })).toEqual({
            selection: { kind: "period", granularity: "month", value: "2026-01" },
            granularityHint: "month",
        });
    });

    it("parses 'September 2026' (full name)", () => {
        expect(parseDateFilterInput("September 2026", { locale: "en", calendar: "gregorian" })).toEqual({
            selection: { kind: "period", granularity: "month", value: "2026-09" },
            granularityHint: "month",
        });
    });

    it("parses 'May 20, 2027' as day", () => {
        expect(parseDateFilterInput("May 20, 2027", { locale: "en", calendar: "gregorian" })).toEqual({
            selection: { kind: "period", granularity: "day", value: "2027-05-20" },
            granularityHint: "day",
        });
    });

    it("parses '20 May 2027' as day", () => {
        expect(parseDateFilterInput("20 May 2027", { locale: "en", calendar: "gregorian" })).toEqual({
            selection: { kind: "period", granularity: "day", value: "2027-05-20" },
            granularityHint: "day",
        });
    });

    it("is case-insensitive", () => {
        expect(parseDateFilterInput("MAY 2027", { locale: "en", calendar: "gregorian" })).toEqual({
            selection: { kind: "period", granularity: "month", value: "2027-05" },
            granularityHint: "month",
        });
    });
});

describe("parser — Named month (Jalali)", () => {
    it("parses 'اردیبهشت 1405'", () => {
        expect(parseDateFilterInput("اردیبهشت 1405", { locale: "fa", calendar: "jalali" })).toEqual({
            selection: { kind: "period", granularity: "month", value: "1405-02" },
            granularityHint: "month",
        });
    });

    it("parses 'اردیبهشت ۱۴۰۵' (Persian digits)", () => {
        expect(parseDateFilterInput("اردیبهشت ۱۴۰۵", { locale: "fa", calendar: "jalali" })).toEqual({
            selection: { kind: "period", granularity: "month", value: "1405-02" },
            granularityHint: "month",
        });
    });

    it("parses 'فروردین ۱۴۰۵' (first month)", () => {
        expect(parseDateFilterInput("فروردین ۱۴۰۵", { locale: "fa", calendar: "jalali" })).toEqual({
            selection: { kind: "period", granularity: "month", value: "1405-01" },
            granularityHint: "month",
        });
    });

    it("parses 'اسفند ۱۴۰۵' (last month)", () => {
        expect(parseDateFilterInput("اسفند ۱۴۰۵", { locale: "fa", calendar: "jalali" })).toEqual({
            selection: { kind: "period", granularity: "month", value: "1405-12" },
            granularityHint: "month",
        });
    });

    it("parses 'مرداد' and 'امرداد' (variant spellings)", () => {
        expect(parseDateFilterInput("مرداد ۱۴۰۵", { locale: "fa", calendar: "jalali" })).toEqual({
            selection: { kind: "period", granularity: "month", value: "1405-05" },
            granularityHint: "month",
        });
        expect(parseDateFilterInput("امرداد ۱۴۰۵", { locale: "fa", calendar: "jalali" })).toEqual({
            selection: { kind: "period", granularity: "month", value: "1405-05" },
            granularityHint: "month",
        });
    });

    it("parses 'آبان' and ASCII 'ابان' (with and without madda)", () => {
        expect(parseDateFilterInput("آبان ۱۴۰۵", { locale: "fa", calendar: "jalali" })).toEqual({
            selection: { kind: "period", granularity: "month", value: "1405-08" },
            granularityHint: "month",
        });
        expect(parseDateFilterInput("ابان ۱۴۰۵", { locale: "fa", calendar: "jalali" })).toEqual({
            selection: { kind: "period", granularity: "month", value: "1405-08" },
            granularityHint: "month",
        });
    });

    it("parses '۳۰ اردیبهشت ۱۴۰۵' as day", () => {
        expect(parseDateFilterInput("۳۰ اردیبهشت ۱۴۰۵", { locale: "fa", calendar: "jalali" })).toEqual({
            selection: { kind: "period", granularity: "day", value: "1405-02-30" },
            granularityHint: "day",
        });
    });
});

describe("parser — relative keywords (English)", () => {
    const ctx = { locale: "en" as const, calendar: "gregorian" as const, now: FROZEN_NOW };

    it("parses 'today'", () => {
        expect(parseDateFilterInput("today", ctx)).toEqual({
            selection: { kind: "period", granularity: "day", value: "2026-05-26" },
            granularityHint: "day",
        });
    });

    it("parses 'yesterday'", () => {
        expect(parseDateFilterInput("yesterday", ctx)).toEqual({
            selection: { kind: "period", granularity: "day", value: "2026-05-25" },
            granularityHint: "day",
        });
    });

    it("parses 'tomorrow'", () => {
        expect(parseDateFilterInput("tomorrow", ctx)).toEqual({
            selection: { kind: "period", granularity: "day", value: "2026-05-27" },
            granularityHint: "day",
        });
    });

    it("parses 'this month'", () => {
        expect(parseDateFilterInput("this month", ctx)).toEqual({
            selection: { kind: "period", granularity: "month", value: "2026-05" },
            granularityHint: "month",
        });
    });

    it("parses 'last month'", () => {
        expect(parseDateFilterInput("last month", ctx)).toEqual({
            selection: { kind: "period", granularity: "month", value: "2026-04" },
            granularityHint: "month",
        });
    });

    it("parses 'next month'", () => {
        expect(parseDateFilterInput("next month", ctx)).toEqual({
            selection: { kind: "period", granularity: "month", value: "2026-06" },
            granularityHint: "month",
        });
    });

    it("parses 'this quarter'", () => {
        expect(parseDateFilterInput("this quarter", ctx)).toEqual({
            selection: { kind: "period", granularity: "quarter", value: "2026-Q2" },
            granularityHint: "quarter",
        });
    });

    it("parses 'last quarter'", () => {
        expect(parseDateFilterInput("last quarter", ctx)).toEqual({
            selection: { kind: "period", granularity: "quarter", value: "2026-Q1" },
            granularityHint: "quarter",
        });
    });

    it("parses 'this year'", () => {
        expect(parseDateFilterInput("this year", ctx)).toEqual({
            selection: { kind: "period", granularity: "year", value: "2026" },
            granularityHint: "year",
        });
    });

    it("parses 'last year'", () => {
        expect(parseDateFilterInput("last year", ctx)).toEqual({
            selection: { kind: "period", granularity: "year", value: "2025" },
            granularityHint: "year",
        });
    });

    it("parses 'next year'", () => {
        expect(parseDateFilterInput("next year", ctx)).toEqual({
            selection: { kind: "period", granularity: "year", value: "2027" },
            granularityHint: "year",
        });
    });

    it("parses 'this week' as a 7-day range", () => {
        const result = parseDateFilterInput("this week", ctx);
        expect(result).toMatchObject({
            selection: { kind: "range" },
            granularityHint: "day",
        });
        if ("selection" in result && result.selection.kind === "range") {
            expect(result.selection.start).toBe("2026-05-24");
            expect(result.selection.end).toBe("2026-05-30");
        }
    });

    it("parses 'last week' (the previous 7-day window)", () => {
        const result = parseDateFilterInput("last week", ctx);
        if ("selection" in result && result.selection.kind === "range") {
            expect(result.selection.start).toBe("2026-05-17");
            expect(result.selection.end).toBe("2026-05-23");
        }
    });
});

describe("parser — relative keywords (Persian)", () => {
    const ctx = { locale: "fa" as const, calendar: "jalali" as const, now: FROZEN_NOW };

    it("parses 'امروز'", () => {
        expect(parseDateFilterInput("امروز", ctx)).toEqual({
            selection: { kind: "period", granularity: "day", value: "1405-03-05" },
            granularityHint: "day",
        });
    });

    it("parses 'دیروز'", () => {
        expect(parseDateFilterInput("دیروز", ctx)).toEqual({
            selection: { kind: "period", granularity: "day", value: "1405-03-04" },
            granularityHint: "day",
        });
    });

    it("parses 'فردا'", () => {
        expect(parseDateFilterInput("فردا", ctx)).toEqual({
            selection: { kind: "period", granularity: "day", value: "1405-03-06" },
            granularityHint: "day",
        });
    });

    it("parses 'این ماه'", () => {
        expect(parseDateFilterInput("این ماه", ctx)).toEqual({
            selection: { kind: "period", granularity: "month", value: "1405-03" },
            granularityHint: "month",
        });
    });

    it("parses 'ماه پیش'", () => {
        expect(parseDateFilterInput("ماه پیش", ctx)).toEqual({
            selection: { kind: "period", granularity: "month", value: "1405-02" },
            granularityHint: "month",
        });
    });

    it("parses 'این فصل'", () => {
        expect(parseDateFilterInput("این فصل", ctx)).toEqual({
            selection: { kind: "period", granularity: "quarter", value: "1405-Q1" },
            granularityHint: "quarter",
        });
    });

    it("parses 'پارسال'", () => {
        expect(parseDateFilterInput("پارسال", ctx)).toEqual({
            selection: { kind: "period", granularity: "year", value: "1404" },
            granularityHint: "year",
        });
    });

    it("parses 'امسال'", () => {
        expect(parseDateFilterInput("امسال", ctx)).toEqual({
            selection: { kind: "period", granularity: "year", value: "1405" },
            granularityHint: "year",
        });
    });

    it("parses 'این هفته' as 7-day range (Saturday-first)", () => {
        const result = parseDateFilterInput("این هفته", ctx);
        expect(result).toMatchObject({
            selection: { kind: "range" },
            granularityHint: "day",
        });
        if ("selection" in result && result.selection.kind === "range") {
            expect(result.selection.start).toBe("1405-03-02");
            expect(result.selection.end).toBe("1405-03-08");
        }
    });

    it("tolerates ZWNJ in compound keywords ('این‌هفته')", () => {
        const result = parseDateFilterInput("این‌هفته", ctx);
        expect(result).toMatchObject({ selection: { kind: "range" }, granularityHint: "day" });
    });
});

describe("parser — number-only", () => {
    it("treats 3-digit number as a year", () => {
        expect(parseDateFilterInput("999", { locale: "en", calendar: "gregorian" })).toEqual({
            selection: { kind: "period", granularity: "year", value: "999" },
            granularityHint: "year",
        });
    });

    it("treats 4-digit number as a year", () => {
        expect(parseDateFilterInput("2026", { locale: "en", calendar: "gregorian" })).toEqual({
            selection: { kind: "period", granularity: "year", value: "2026" },
            granularityHint: "year",
        });
    });

    it("returns 'ambiguous' for 1-digit numbers", () => {
        expect(parseDateFilterInput("5", { locale: "en", calendar: "gregorian" })).toEqual({ error: "ambiguous" });
    });

    it("returns 'ambiguous' for 2-digit numbers", () => {
        expect(parseDateFilterInput("27", { locale: "en", calendar: "gregorian" })).toEqual({ error: "ambiguous" });
    });
});

describe("parser — Gregorian + Jalali cross-checks", () => {
    it("parses a 4-digit ISO date as a Jalali date under calendar=jalali", () => {
        const result = parseDateFilterInput("1405-02-30", { locale: "fa", calendar: "jalali" });
        expect(result).toEqual({
            selection: { kind: "period", granularity: "day", value: "1405-02-30" },
            granularityHint: "day",
        });
    });

    it("Jalali Q4 of 1405 is distinct from Gregorian Q4 of 2026", () => {
        expect(parseDateFilterInput("Q4", { locale: "en", calendar: "gregorian", now: FROZEN_NOW })).toEqual({
            selection: { kind: "period", granularity: "quarter", value: "2026-Q4" },
            granularityHint: "quarter",
        });
        expect(parseDateFilterInput("Q4", { locale: "fa", calendar: "jalali", now: FROZEN_NOW })).toEqual({
            selection: { kind: "period", granularity: "quarter", value: "1405-Q4" },
            granularityHint: "quarter",
        });
    });

    it("English month names do not parse under Jalali calendar (different month set)", () => {
        expect(parseDateFilterInput("May 2027", { locale: "fa", calendar: "jalali" })).toEqual({ error: "invalid" });
    });

    it("Persian month names do not parse under Gregorian calendar", () => {
        expect(parseDateFilterInput("اردیبهشت 1405", { locale: "en", calendar: "gregorian" })).toEqual({
            error: "invalid",
        });
    });
});

describe("parser — surrounding whitespace + capitalisation", () => {
    it("trims leading/trailing whitespace", () => {
        expect(parseDateFilterInput("  2026-05-26  ", { locale: "en", calendar: "gregorian" })).toEqual({
            selection: { kind: "period", granularity: "day", value: "2026-05-26" },
            granularityHint: "day",
        });
    });

    it("collapses internal whitespace runs", () => {
        expect(parseDateFilterInput("Q4   2025", { locale: "en", calendar: "gregorian" })).toEqual({
            selection: { kind: "period", granularity: "quarter", value: "2025-Q4" },
            granularityHint: "quarter",
        });
    });

    it("is fully case-insensitive on relative keywords", () => {
        expect(parseDateFilterInput("TODAY", { locale: "en", calendar: "gregorian", now: FROZEN_NOW })).toEqual({
            selection: { kind: "period", granularity: "day", value: "2026-05-26" },
            granularityHint: "day",
        });
    });
});
