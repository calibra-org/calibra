import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { defaultLocale, type Locale } from "./config";
import { routing } from "./routing";

/**
 * Resolves the active locale per request and lazy-loads its message catalog. Wired into Next.js
 * via the `createNextIntlPlugin` call in `next.config.ts`.
 */
export default getRequestConfig(async ({ requestLocale }) => {
    const requested = await requestLocale;
    const locale: Locale = hasLocale(routing.locales, requested) ? requested : defaultLocale;

    return {
        locale,
        messages: (await import(`../../../messages/${locale}.json`)).default,
    };
});
