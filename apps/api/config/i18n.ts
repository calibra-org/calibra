import app from "@adonisjs/core/services/app";
import { defineConfig, formatters, loaders } from "@adonisjs/i18n";

/**
 * i18n config. Translation catalogs live in `resources/lang/<locale>/*.json`. The active locale is
 * picked up automatically from the `Accept-Language` header on each request (the SDK forwards it
 * via the `locale` option to `createApiClient`).
 *
 * `en` is the fallback because the API code, schema, and logs are English. Persian-speaking clients
 * get translated user-facing copy while engineers reading logs still see canonical English keys.
 */
const i18nConfig = defineConfig({
    defaultLocale: "en",
    formatter: formatters.icu(),
    loaders: [
        loaders.fs({
            location: app.languageFilesPath(),
        }),
    ],
    supportedLocales: ["en", "fa"],
    fallbackLocales: {
        fa: "en",
    },
});

export default i18nConfig;
