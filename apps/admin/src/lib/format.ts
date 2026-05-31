import type { Locale } from "@calibra/shared/i18n";
import { formatMoney as formatMoneyWithConfig, type MoneyFormatConfig } from "@calibra/shared/money";

import { calendarForLocale, getDateLib } from "#/components/ui/date-picker/date-lib";
import { FALLBACK_MONEY_CONFIG } from "#/lib/currency/config";

/**
 * Locale-aware formatters used across the admin. Money is stored in BASE (Rial) minor units and
 * rendered through the store's resolved currency config — no hardcoded ÷10 or baked-in symbols.
 * Persian locale renders Persian digits (`۱۲۳`); English renders ASCII.
 */

const persianDigit = "۰۱۲۳۴۵۶۷۸۹";
const asciiDigit = "0123456789";

function toLocaleDigits(value: string, locale: Locale): string {
    if (locale !== "fa") return value;
    return value.replace(/[0-9]/g, (digit) => persianDigit[asciiDigit.indexOf(digit)] ?? digit);
}

/**
 * Active store currency config. The {@link MoneyFormatProvider} (client) and the authenticated
 * layout (server) call {@link setActiveMoneyConfig} so the pure `formatMoney` below — used in
 * column builders and cells that can't read React context — stays config-driven. The config is
 * store-global (one currency), so a module singleton is safe across requests.
 */
let activeMoneyConfig: MoneyFormatConfig = FALLBACK_MONEY_CONFIG;

/** Point the admin's pure money formatter at the store's resolved currency config. */
export function setActiveMoneyConfig(config: MoneyFormatConfig): void {
    activeMoneyConfig = config;
}

export interface FormatMoneyOptions {
    /** When `true`, appends the currency symbol. Defaults to `true`. */
    withSymbol?: boolean;
    /**
     * @deprecated Display currency is now store config, not a per-call choice. Ignored — kept so
     * existing call sites compile during the currency migration.
     */
    display?: "IRT" | "IRR";
}

/** Format a stored BASE-minor (Rial) amount using the active store currency config. */
export function formatMoney(minor: number, locale: Locale, options: FormatMoneyOptions = {}): string {
    return formatMoneyWithConfig(minor, activeMoneyConfig, {
        locale: locale === "fa" ? "fa" : "en",
        withSymbol: options.withSymbol ?? true,
    });
}

export function formatNumber(value: number, locale: Locale): string {
    return toLocaleDigits(new Intl.NumberFormat("en-US").format(value), locale);
}

export function formatPercent(value: number, locale: Locale, fractionDigits = 1): string {
    const formatted = value.toFixed(fractionDigits);
    return `${toLocaleDigits(formatted, locale)}%`;
}

/**
 * Operator-chosen date/time format patterns (date-fns tokens). Seeded from a server fetch for the
 * first paint, then kept live by the Date & Time settings query — so saving a new format re-renders
 * every date across the admin without a reload. Mirrors the {@link setActiveMoneyConfig} singleton.
 */
export interface DateTimeConfig {
    dateFormat: string;
    timeFormat: string;
}

/** Safe defaults used until the stored config loads (match the seeded `datetime` group). */
export const FALLBACK_DATETIME_CONFIG: DateTimeConfig = { dateFormat: "d MMMM yyyy", timeFormat: "HH:mm" };

let activeDateTimeConfig: DateTimeConfig = FALLBACK_DATETIME_CONFIG;

/** Point the admin's date formatters at the store's saved date/time formats. */
export function setActiveDateTimeConfig(config: DateTimeConfig): void {
    activeDateTimeConfig = config;
}

/** The currently active date/time format config (for previews / callers that need the raw patterns). */
export function getActiveDateTimeConfig(): DateTimeConfig {
    return activeDateTimeConfig;
}

/**
 * Render a date through a date-fns format `pattern` in the active calendar — Jalali for `fa`
 * (Persian month names + digits), Gregorian for `en`. Reuses the same `DateLib` instances the date
 * picker uses, so calendar behaviour is identical everywhere. A malformed pattern falls back to the
 * default date format rather than throwing.
 */
export function formatWithPattern(value: string | Date, pattern: string, locale: Locale): string {
    const date = value instanceof Date ? value : new Date(value);
    const lib = getDateLib(calendarForLocale(locale));
    try {
        return toLocaleDigits(lib.format(date, pattern), locale);
    } catch {
        return toLocaleDigits(lib.format(date, FALLBACK_DATETIME_CONFIG.dateFormat), locale);
    }
}

/**
 * Render an ISO timestamp as a calendar date in the active locale. With no `options`, uses the
 * operator's saved date-format pattern (the default path — this is what makes the Date & Time
 * setting drive the panel). Passing explicit `Intl.DateTimeFormatOptions` keeps the legacy
 * `Intl`-based rendering for the few call sites that need a specific non-configured shape.
 */
export function formatDate(iso: string, locale: Locale, options?: Intl.DateTimeFormatOptions): string {
    if (options !== undefined) {
        const formatter = new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : "en-US", options);
        return formatter.format(new Date(iso));
    }
    return formatWithPattern(iso, activeDateTimeConfig.dateFormat, locale);
}

/** Render an ISO timestamp as date + time using the operator's saved date and time patterns. */
export function formatDateTime(iso: string, locale: Locale): string {
    return formatWithPattern(iso, `${activeDateTimeConfig.dateFormat} ${activeDateTimeConfig.timeFormat}`, locale);
}

/**
 * Relative time ("۲ دقیقه پیش" / "2 minutes ago") via `Intl.RelativeTimeFormat`. The reference
 * point defaults to `Date.now()` but can be overridden for deterministic tests / fixtures.
 */
export function formatRelativeTime(iso: string, locale: Locale, reference: Date = new Date()): string {
    const target = new Date(iso);
    const diffMs = target.getTime() - reference.getTime();
    const formatter = new Intl.RelativeTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { numeric: "auto" });
    const units: { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
        { unit: "year", ms: 365 * 24 * 60 * 60 * 1000 },
        { unit: "month", ms: 30 * 24 * 60 * 60 * 1000 },
        { unit: "day", ms: 24 * 60 * 60 * 1000 },
        { unit: "hour", ms: 60 * 60 * 1000 },
        { unit: "minute", ms: 60 * 1000 },
        { unit: "second", ms: 1000 },
    ];
    for (const { unit, ms } of units) {
        if (Math.abs(diffMs) >= ms || unit === "second") {
            return formatter.format(Math.round(diffMs / ms), unit);
        }
    }
    return formatter.format(0, "second");
}
