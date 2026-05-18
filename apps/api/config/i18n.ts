import app from "@adonisjs/core/services/app";
import { defineConfig, formatters, loaders } from "@adonisjs/i18n";

/**
 * i18n config. Translation catalogs live in `resources/lang/<locale>/*.json`. The active locale is
 * picked up automatically from the `Accept-Language` header on each request (the SDK forwards it
 * via the `locale` option to `createApiClient`). Persian is the default because the primary
 * audience is Persian-speaking; English remains a supported toggle with `fa` as its fallback so
 * Persian copy still wins when an English key is missing.
 */
const i18nConfig = defineConfig({
    defaultLocale: "fa",
    formatter: formatters.icu(),
    loaders: [
        loaders.fs({
            location: app.languageFilesPath(),
        }),
    ],
    supportedLocales: ["fa", "en"],
    fallbackLocales: {
        en: "fa",
    },
});

export default i18nConfig;
