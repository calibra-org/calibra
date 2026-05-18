import type { HttpContext } from "@adonisjs/core/http";
import type { NextFn } from "@adonisjs/core/types/http";
import i18nManager from "@adonisjs/i18n/services/main";

/**
 * Resolves the request locale from the `Accept-Language` header and attaches the corresponding
 * i18n instance to the HTTP context. Controllers and exception handlers read `ctx.i18n.t(...)` to
 * return localized copy.
 *
 * The SDK sets `Accept-Language` from the calling app's UI locale (next-intl `useLocale()`), so
 * what the user sees in the chrome and what the API returns are always in sync.
 */
export default class DetectUserLocaleMiddleware {
    async handle(ctx: HttpContext, next: NextFn) {
        const language = ctx.request.header("Accept-Language");
        const supported = i18nManager.supportedLocales();
        const matched =
            language === undefined
                ? i18nManager.defaultLocale
                : (supported.find((locale) => language.toLowerCase().startsWith(locale.toLowerCase())) ??
                  i18nManager.defaultLocale);

        ctx.i18n = i18nManager.locale(matched);
        return next();
    }
}

declare module "@adonisjs/core/http" {
    interface HttpContext {
        i18n: ReturnType<typeof i18nManager.locale>;
    }
}
