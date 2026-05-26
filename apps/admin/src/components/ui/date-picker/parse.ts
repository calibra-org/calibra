import { toEnglishDigits } from "@calibra/shared/digits";

import { dateToValueString, getDateLib, getQuarter, startOfQuarter } from "./date-lib";
import type { Calendar, Granularity, PeriodString } from "./types";

interface ParseContext {
    locale: "en" | "fa";
    calendar: Calendar;
    /** Reference instant for relative keywords. Defaults to `new Date()`; tests inject a frozen one. */
    now?: Date;
}

/**
 * Selection a parser branch produces. The hook combines this with the current operator to build a
 * {@link DateFilterValue}; the parser never picks the operator.
 */
export type ParsedSelection =
    | { kind: "period"; granularity: Granularity; value: PeriodString }
    | { kind: "range"; start: PeriodString; end: PeriodString };

export interface ParseSuccess {
    selection: ParsedSelection;
    /** Hint the hook uses to flip the active granularity tab when the user submits typed input. */
    granularityHint: Granularity;
}

export interface ParseError {
    error: "empty" | "invalid" | "ambiguous";
}

export type ParseResult = ParseSuccess | ParseError;

/**
 * Parse a free-text date string. Grammar branches are tried in order; the first match wins. The
 * result is intentionally side-effect-free so the dialog can probe the parser on every keystroke
 * without scheduling work.
 */
export function parseDateFilterInput(text: string, ctx: ParseContext): ParseResult {
    if (text.trim() === "") return { error: "empty" };
    const normalised = normalize(text);

    const branches = [
        parseRelative,
        parseQuarter,
        parseHalfYear,
        parseIsoDate,
        parseIsoMonth,
        parseSlashDate,
        parseNamedMonth,
        parseIsoYear,
        parseNumberOnly,
    ] as const;

    for (const branch of branches) {
        const out = branch(normalised, ctx);
        if (out !== null) return out;
    }
    return { error: "invalid" };
}

/**
 * Normalisation pass applied once before the parser branches:
 * - Persian / Arabic-Indic digits → ASCII
 * - Trim, collapse internal whitespace
 * - Lowercase ASCII letters (Q4 ≡ q4); month names stay case-insensitive
 * - Strip Persian ZWNJ (U+200C) so `این‌هفته` and `این هفته` parse identically
 */
function normalize(text: string): string {
    return toEnglishDigits(text).replace(/‌/g, " ").trim().replace(/\s+/g, " ").toLowerCase();
}

function todayDate(ctx: ParseContext): Date {
    return ctx.now ?? new Date();
}

function yearInCalendar(date: Date, calendar: Calendar): number {
    return getDateLib(calendar).getYear(date);
}

function makeDayValue(year: number, monthZero: number, day: number, calendar: Calendar): PeriodString | null {
    const lib = getDateLib(calendar);
    const today = lib.today();
    const seeded = lib.startOfDay(lib.setYear(lib.setMonth(today, monthZero), year));
    const candidate = lib.addDays(lib.startOfMonth(seeded), day - 1);
    if (lib.getYear(candidate) !== year || lib.getMonth(candidate) !== monthZero) return null;
    return dateToValueString(candidate, "day", lib);
}

function pad(n: number): string {
    return String(n).padStart(2, "0");
}

const ISO_DATE = /^(\d{3,4})-(\d{1,2})-(\d{1,2})$/;
function parseIsoDate(s: string, ctx: ParseContext): ParseResult | null {
    const m = ISO_DATE.exec(s);
    if (m === null) return null;
    const [, y, mo, d] = m;
    const value = makeDayValue(Number(y), Number(mo) - 1, Number(d), ctx.calendar);
    if (value === null) return null;
    return { selection: { kind: "period", granularity: "day", value }, granularityHint: "day" };
}

const ISO_MONTH = /^(\d{3,4})-(\d{1,2})$/;
function parseIsoMonth(s: string, _ctx: ParseContext): ParseResult | null {
    const m = ISO_MONTH.exec(s);
    if (m === null) return null;
    const month = Number(m[2]);
    if (month < 1 || month > 12) return null;
    return {
        selection: { kind: "period", granularity: "month", value: `${m[1]}-${pad(month)}` },
        granularityHint: "month",
    };
}

const ISO_YEAR = /^(\d{3,4})$/;
function parseIsoYear(s: string, _ctx: ParseContext): ParseResult | null {
    const m = ISO_YEAR.exec(s);
    if (m === null) return null;
    return parseNumberOnly(s, _ctx);
}

const Q_STANDALONE = /^q([1-4])$/;
const Q_WITH_YEAR_A = /^q([1-4])\s+(\d{3,4})$/;
const Q_WITH_YEAR_B = /^(\d{3,4})[/-]?q([1-4])$/;
const Q_WITH_YEAR_C = /^(\d{3,4})\s+q([1-4])$/;
function parseQuarter(s: string, ctx: ParseContext): ParseResult | null {
    const standalone = Q_STANDALONE.exec(s);
    if (standalone !== null) {
        const year = yearInCalendar(todayDate(ctx), ctx.calendar);
        return periodHit("quarter", `${year}-Q${standalone[1]}`);
    }
    const a = Q_WITH_YEAR_A.exec(s);
    if (a !== null) return periodHit("quarter", `${a[2]}-Q${a[1]}`);
    const b = Q_WITH_YEAR_B.exec(s);
    if (b !== null) return periodHit("quarter", `${b[1]}-Q${b[2]}`);
    const c = Q_WITH_YEAR_C.exec(s);
    if (c !== null) return periodHit("quarter", `${c[1]}-Q${c[2]}`);
    return null;
}

const H_STANDALONE = /^h([12])$/;
const H_WITH_YEAR_A = /^h([12])\s+(\d{3,4})$/;
const H_WITH_YEAR_B = /^(\d{3,4})[/-]?h([12])$/;
function parseHalfYear(s: string, ctx: ParseContext): ParseResult | null {
    const standalone = H_STANDALONE.exec(s);
    if (standalone !== null) {
        const year = yearInCalendar(todayDate(ctx), ctx.calendar);
        return periodHit("half_year", `${year}-H${standalone[1]}`);
    }
    const a = H_WITH_YEAR_A.exec(s);
    if (a !== null) return periodHit("half_year", `${a[2]}-H${a[1]}`);
    const b = H_WITH_YEAR_B.exec(s);
    if (b !== null) return periodHit("half_year", `${b[1]}-H${b[2]}`);
    return null;
}

function periodHit(granularity: Granularity, value: PeriodString): ParseResult {
    return { selection: { kind: "period", granularity, value }, granularityHint: granularity };
}

const SLASH_DATE = /^(\d{1,4})\/(\d{1,2})\/(\d{1,4})$/;
function parseSlashDate(s: string, ctx: ParseContext): ParseResult | null {
    const m = SLASH_DATE.exec(s);
    if (m === null) return null;
    const [, a, b, c] = m;
    const aN = Number(a);
    const bN = Number(b);
    const cN = Number(c);

    if (a.length >= 3) {
        const value = makeDayValue(aN, bN - 1, cN, ctx.calendar);
        if (value === null) return null;
        return periodHit("day", value);
    }
    if (c.length < 3) return null;

    let monthZero: number;
    let day: number;
    if (ctx.locale === "en") {
        monthZero = aN - 1;
        day = bN;
    } else {
        day = aN;
        monthZero = bN - 1;
    }
    const value = makeDayValue(cN, monthZero, day, ctx.calendar);
    if (value === null) return null;
    return periodHit("day", value);
}

const EN_MONTHS = [
    ["january", "jan"],
    ["february", "feb"],
    ["march", "mar"],
    ["april", "apr"],
    ["may"],
    ["june", "jun"],
    ["july", "jul"],
    ["august", "aug"],
    ["september", "sep", "sept"],
    ["october", "oct"],
    ["november", "nov"],
    ["december", "dec"],
] as const;

const FA_MONTHS = [
    ["فروردین"],
    ["اردیبهشت"],
    ["خرداد"],
    ["تیر"],
    ["مرداد", "امرداد"],
    ["شهریور"],
    ["مهر"],
    ["آبان", "ابان"],
    ["آذر", "اذر"],
    ["دی"],
    ["بهمن"],
    ["اسفند"],
] as const;

function findMonthIndex(token: string, calendar: Calendar): number | null {
    const names = calendar === "jalali" ? FA_MONTHS : EN_MONTHS;
    for (let i = 0; i < names.length; i += 1) {
        for (const alias of names[i]) {
            if (alias === token) return i;
        }
    }
    return null;
}

const NAMED_MONTH_YEAR = /^([\p{L}]+)\s+(\d{3,4})$/u;
const NAMED_MONTH_DAY_YEAR = /^([\p{L}]+)\s+(\d{1,2}),?\s+(\d{3,4})$/u;
const DAY_NAMED_MONTH_YEAR = /^(\d{1,2})\s+([\p{L}]+)\s+(\d{3,4})$/u;
function parseNamedMonth(s: string, ctx: ParseContext): ParseResult | null {
    const dayMonthYear = DAY_NAMED_MONTH_YEAR.exec(s);
    if (dayMonthYear !== null) {
        const monthIdx = findMonthIndex(dayMonthYear[2], ctx.calendar);
        if (monthIdx === null) return null;
        const value = makeDayValue(Number(dayMonthYear[3]), monthIdx, Number(dayMonthYear[1]), ctx.calendar);
        if (value === null) return null;
        return periodHit("day", value);
    }
    const monthDayYear = NAMED_MONTH_DAY_YEAR.exec(s);
    if (monthDayYear !== null) {
        const monthIdx = findMonthIndex(monthDayYear[1], ctx.calendar);
        if (monthIdx === null) return null;
        const value = makeDayValue(Number(monthDayYear[3]), monthIdx, Number(monthDayYear[2]), ctx.calendar);
        if (value === null) return null;
        return periodHit("day", value);
    }
    const monthYear = NAMED_MONTH_YEAR.exec(s);
    if (monthYear !== null) {
        const monthIdx = findMonthIndex(monthYear[1], ctx.calendar);
        if (monthIdx === null) return null;
        return periodHit("month", `${monthYear[2]}-${pad(monthIdx + 1)}`);
    }
    return null;
}

interface RelativeRule {
    /** Aliases the keyword matches against the normalised input. */
    keys: readonly string[];
    /** Builds the parsed selection from the reference instant. */
    build: (now: Date, ctx: ParseContext) => ParseResult | null;
}

const RELATIVE_RULES: readonly RelativeRule[] = [
    {
        keys: ["today", "امروز"],
        build: (now, ctx) => dayHit(now, ctx),
    },
    {
        keys: ["yesterday", "دیروز"],
        build: (now, ctx) => dayHit(addDays(now, -1, ctx), ctx),
    },
    {
        keys: ["tomorrow", "فردا"],
        build: (now, ctx) => dayHit(addDays(now, 1, ctx), ctx),
    },
    {
        keys: ["this week", "این هفته"],
        build: (now, ctx) => weekRange(now, ctx),
    },
    {
        keys: ["last week", "هفته پیش", "هفته قبل", "هفته گذشته"],
        build: (now, ctx) => weekRange(addDays(now, -7, ctx), ctx),
    },
    {
        keys: ["next week", "هفته بعد", "هفته آینده"],
        build: (now, ctx) => weekRange(addDays(now, 7, ctx), ctx),
    },
    {
        keys: ["this month", "این ماه", "ماه جاری"],
        build: (now, ctx) => monthHit(now, ctx),
    },
    {
        keys: ["last month", "ماه پیش", "ماه قبل", "ماه گذشته"],
        build: (now, ctx) => monthHit(addMonths(now, -1, ctx), ctx),
    },
    {
        keys: ["next month", "ماه بعد", "ماه آینده"],
        build: (now, ctx) => monthHit(addMonths(now, 1, ctx), ctx),
    },
    {
        keys: ["this quarter", "این فصل", "فصل جاری"],
        build: (now, ctx) => quarterHit(now, ctx),
    },
    {
        keys: ["last quarter", "فصل پیش", "فصل قبل", "فصل گذشته"],
        build: (now, ctx) => quarterHit(addMonths(now, -3, ctx), ctx),
    },
    {
        keys: ["next quarter", "فصل بعد", "فصل آینده"],
        build: (now, ctx) => quarterHit(addMonths(now, 3, ctx), ctx),
    },
    {
        keys: ["this year", "امسال", "این سال", "سال جاری"],
        build: (now, ctx) => yearHit(now, ctx),
    },
    {
        keys: ["last year", "پارسال", "سال پیش", "سال قبل", "سال گذشته"],
        build: (now, ctx) => yearHit(addYears(now, -1, ctx), ctx),
    },
    {
        keys: ["next year", "سال بعد", "سال آینده"],
        build: (now, ctx) => yearHit(addYears(now, 1, ctx), ctx),
    },
];

function parseRelative(s: string, ctx: ParseContext): ParseResult | null {
    for (const rule of RELATIVE_RULES) {
        for (const key of rule.keys) {
            if (key === s) return rule.build(todayDate(ctx), ctx);
        }
    }
    return null;
}

function dayHit(date: Date, ctx: ParseContext): ParseResult {
    const lib = getDateLib(ctx.calendar);
    return periodHit("day", dateToValueString(date, "day", lib));
}

function monthHit(date: Date, ctx: ParseContext): ParseResult {
    const lib = getDateLib(ctx.calendar);
    return periodHit("month", dateToValueString(date, "month", lib));
}

function quarterHit(date: Date, ctx: ParseContext): ParseResult {
    const lib = getDateLib(ctx.calendar);
    const anchor = startOfQuarter(date, lib);
    return periodHit("quarter", `${lib.getYear(anchor)}-Q${getQuarter(anchor, lib)}`);
}

function yearHit(date: Date, ctx: ParseContext): ParseResult {
    const lib = getDateLib(ctx.calendar);
    return periodHit("year", dateToValueString(date, "year", lib));
}

function weekRange(date: Date, ctx: ParseContext): ParseResult {
    const lib = getDateLib(ctx.calendar);
    const start = lib.startOfWeek(date, { weekStartsOn: ctx.calendar === "jalali" ? 6 : 0 });
    const end = lib.endOfWeek(date, { weekStartsOn: ctx.calendar === "jalali" ? 6 : 0 });
    return {
        selection: {
            kind: "range",
            start: dateToValueString(start, "day", lib),
            end: dateToValueString(end, "day", lib),
        },
        granularityHint: "day",
    };
}

function addDays(date: Date, n: number, ctx: ParseContext): Date {
    return getDateLib(ctx.calendar).addDays(date, n);
}
function addMonths(date: Date, n: number, ctx: ParseContext): Date {
    return getDateLib(ctx.calendar).addMonths(date, n);
}
function addYears(date: Date, n: number, ctx: ParseContext): Date {
    return getDateLib(ctx.calendar).addYears(date, n);
}

function parseNumberOnly(s: string, _ctx: ParseContext): ParseResult | null {
    if (!/^\d{1,4}$/.test(s)) return null;
    if (s.length < 3) return { error: "ambiguous" };
    return periodHit("year", s);
}
