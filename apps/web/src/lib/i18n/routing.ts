import { isLocale, type Locale, locales } from "@calibra/shared/i18n";
import { defineRouting } from "next-intl/routing";

const FALLBACK_DEFAULT: Locale = "fa";

function resolveDefaultLocale(): Locale {
    const fromEnv = process.env.NEXT_PUBLIC_DEFAULT_LOCALE;
    return fromEnv && isLocale(fromEnv) ? fromEnv : FALLBACK_DEFAULT;
}

/**
 * Locale-aware routing for the storefront. The default locale is sourced from
 * `NEXT_PUBLIC_DEFAULT_LOCALE` (validated against the shared locales list) and falls back to
 * Persian. `localePrefix: "as-needed"` keeps the default locale's routes at `/` while non-default
 * locales live under their prefix (e.g. `/en/products`). `localeDetection: false` ensures the
 * configured default wins regardless of the visitor's browser `Accept-Language`; the in-app
 * LocaleSwitch is the only way to leave the default.
 */
export const routing = defineRouting({
    locales,
    defaultLocale: resolveDefaultLocale(),
    localePrefix: "as-needed",
    localeDetection: false,
});
