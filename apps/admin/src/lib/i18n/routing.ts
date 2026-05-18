import { locales } from "@calibra/shared/i18n";
import { defineRouting } from "next-intl/routing";

/**
 * Locale-aware routing for the admin panel. Persian is the default — both customers and operators
 * are Persian-speaking; English is a secondary toggle. `localePrefix: "as-needed"` keeps `/` /
 * `/dashboard` etc. as Persian routes, English lives under `/en/dashboard`.
 */
export const routing = defineRouting({
    locales,
    defaultLocale: "fa",
    localePrefix: "as-needed",
});
