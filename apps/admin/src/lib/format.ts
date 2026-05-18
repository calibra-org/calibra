import type { Locale } from "@calibra/shared/i18n";

/**
 * Locale-aware formatters used across the admin. Money is stored in Rial minor units; depending
 * on the display preference the formatter renders Toman (divide by 10) or Rial (raw). Persian
 * locale renders with Persian digits (e.g. `۱۲۳`); English renders with ASCII digits.
 */

const persianDigit = "۰۱۲۳۴۵۶۷۸۹";
const asciiDigit = "0123456789";

function toLocaleDigits(value: string, locale: Locale): string {
    if (locale !== "fa") return value;
    return value.replace(/[0-9]/g, (digit) => persianDigit[asciiDigit.indexOf(digit)] ?? digit);
}

export interface FormatMoneyOptions {
    /** `"IRT"` (Toman, divides by 10) or `"IRR"` (Rial, raw). Defaults to `"IRT"`. */
    display?: "IRT" | "IRR";
    /** When `true`, appends the currency symbol after the amount. Defaults to `true`. */
    withSymbol?: boolean;
}

/**
 * Format a Rial-minor amount for display. Iranian retail convention shows Toman (major), so the
 * default divisor is 10. Use `display: "IRR"` for receipts that need the raw Rial value.
 */
export function formatMoney(minor: number, locale: Locale, options: FormatMoneyOptions = {}): string {
    const { display = "IRT", withSymbol = true } = options;
    const amount = display === "IRT" ? minor / 10 : minor;
    const rounded = Math.round(amount);
    const grouped = new Intl.NumberFormat("en-US").format(rounded);
    const localized = toLocaleDigits(grouped, locale);
    if (!withSymbol) return localized;
    const symbol = locale === "fa" ? (display === "IRT" ? "تومان" : "ریال") : display === "IRT" ? "Toman" : "Rial";
    return locale === "fa" ? `${localized} ${symbol}` : `${localized} ${symbol}`;
}

export function formatNumber(value: number, locale: Locale): string {
    return toLocaleDigits(new Intl.NumberFormat("en-US").format(value), locale);
}

export function formatPercent(value: number, locale: Locale, fractionDigits = 1): string {
    const formatted = value.toFixed(fractionDigits);
    return `${toLocaleDigits(formatted, locale)}%`;
}

/**
 * Render an ISO timestamp as a calendar date in the active locale. Persian uses Jalali (`fa-IR-u-ca-persian`),
 * English uses Gregorian. We deliberately don't show seconds — the panel never needs them.
 */
export function formatDate(iso: string, locale: Locale, options: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" }): string {
    const date = new Date(iso);
    const formatter = new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : "en-US", options);
    return formatter.format(date);
}

export function formatDateTime(iso: string, locale: Locale): string {
    return formatDate(iso, locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
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
