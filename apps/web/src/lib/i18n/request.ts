import type { Locale } from "@calibra/shared/i18n";
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { routing } from "./routing";

/**
 * Resolves the active locale per request and lazy-loads its message catalog. Wired into Next.js
 * via the `createNextIntlPlugin` call in `next.config.ts`.
 */
export default getRequestConfig(async ({ requestLocale }) => {
    const requested = await requestLocale;
    const locale: Locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

    return {
        locale,
        messages: (await import(`../../../messages/${locale}.json`)).default,
    };
});
