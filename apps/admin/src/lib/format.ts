import type { Locale } from "@calibra/shared/i18n";
import { formatMoney as formatMoneyWithConfig, type MoneyFormatConfig } from "@calibra/shared/money";

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
 * Render an ISO timestamp as a calendar date in the active locale. Persian uses Jalali (`fa-IR-u-ca-persian`),
 * English uses Gregorian. We deliberately don't show seconds — the panel never needs them.
 */
export function formatDate(
    iso: string,
    locale: Locale,
    options: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" },
): string {
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
