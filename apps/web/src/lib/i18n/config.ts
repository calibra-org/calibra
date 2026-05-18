/**
 * Locale registry. English is the default; Persian is the secondary locale.
 *
 * To add a locale: extend {@link locales}, add a matching JSON catalog under `messages/<code>.json`,
 * and (if it's an RTL language) extend {@link rtlLocales}.
 */
export const locales = ["en", "fa"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

const rtlLocales: ReadonlySet<Locale> = new Set(["fa"]);

export function isLocale(value: string): value is Locale {
    return (locales as readonly string[]).includes(value);
}

export function directionFor(locale: Locale): "rtl" | "ltr" {
    return rtlLocales.has(locale) ? "rtl" : "ltr";
}
