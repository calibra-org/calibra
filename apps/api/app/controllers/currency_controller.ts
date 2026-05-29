import cache from "@adonisjs/cache/services/main";
import type { HttpContext } from "@adonisjs/core/http";

import { CacheKeys, CacheTags } from "#services/cache_keys";
import { resolveCurrencyConfig } from "#services/currency_config_service";
import { toCurrencyConfig } from "#transformers/currency_transformer";

export default class CurrencyController {
    /**
     * GET /api/v1/currency — public, cached display-currency config. Both FE apps build a
     * `MoneyFormatConfig` from this so storefront and admin render prices identically. Cache is
     * invalidated on the admin General-settings PATCH.
     */
    async show(ctx: HttpContext) {
        const locale = ctx.i18n.locale;
        return cache.getOrSet({
            key: CacheKeys.currency.config(locale),
            ttl: "30m",
            tags: [CacheTags.currency],
            factory: async () => {
                const resolved = await resolveCurrencyConfig();
                return { data: toCurrencyConfig(resolved) };
            },
        });
    }
}
