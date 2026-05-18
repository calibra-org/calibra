/**
 * Shared locale registry for `apps/web` (storefront) and `apps/admin` (admin panel).
 *
 * The list of locales and the direction map are shared because both apps target the same audience
 * (Persian + English). Each app picks its own `defaultLocale` — storefront defaults to Persian for
 * customers, admin defaults to English for operators — so that field is **not** exported here.
 */

export const locales = ["en", "fa"] as const;
export type Locale = (typeof locales)[number];

const rtlLocales: ReadonlySet<Locale> = new Set(["fa"]);

export function isLocale(value: string): value is Locale {
    return (locales as readonly string[]).includes(value);
}

export function directionFor(locale: Locale): "rtl" | "ltr" {
    return rtlLocales.has(locale) ? "rtl" : "ltr";
}
