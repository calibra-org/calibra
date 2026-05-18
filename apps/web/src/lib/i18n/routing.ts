import { locales } from "@calibra/shared/i18n";
import { defineRouting } from "next-intl/routing";

/**
 * Locale-aware routing for the storefront. Persian is the default — the primary audience is
 * Persian-speaking customers. `localePrefix: "as-needed"` keeps `/` and `/products` as Persian
 * routes; English lives under `/en/*`.
 */
export const routing = defineRouting({
    locales,
    defaultLocale: "fa",
    localePrefix: "as-needed",
});
