import { defineRouting } from "next-intl/routing";

import { defaultLocale, locales } from "./config";

/**
 * Single source of truth for locale-aware routing. `localePrefix: "as-needed"` keeps the default
 * locale (`fa`) unprefixed at `/` while English lives under `/en/*`.
 */
export const routing = defineRouting({
    locales,
    defaultLocale,
    localePrefix: "as-needed",
});
