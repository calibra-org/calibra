/**
 * Display formatters for the console. Money values arrive as integer minor units in the tenant's
 * currency; ops KPIs use compact notation (`49.2M`) so a fleet of large Rial figures stays readable
 * — exact accounting lives in each shop's own admin.
 */

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/** Localize ASCII digits to Persian when rendering under `fa`. */
function localizeDigits(value: string, locale: string): string {
    if (locale !== "fa") return value;
    return value.replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

export function formatNumber(n: number, locale: string): string {
    return localizeDigits(new Intl.NumberFormat("en-US").format(n), locale);
}

export function formatCompact(n: number, locale: string): string {
    return localizeDigits(new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n), locale);
}

export function formatMoney(minorUnits: number, code: string, locale: string): string {
    return `${formatCompact(minorUnits, locale)} ${code}`;
}

export function formatBytes(bytes: number, locale: string): string {
    if (bytes <= 0) return localizeDigits("0 B", locale);
    const units = ["B", "KB", "MB", "GB", "TB"];
    const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** exp;
    return localizeDigits(`${value.toFixed(value < 10 && exp > 0 ? 1 : 0)} ${units[exp]}`, locale);
}

export function formatDate(iso: string | null | undefined, locale: string): string {
    if (!iso) return "—";
    const d = new Date(iso);
    return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { dateStyle: "medium" }).format(d);
}
