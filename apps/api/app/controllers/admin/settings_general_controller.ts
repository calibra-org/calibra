import cache from "@adonisjs/cache/services/main";
import type { HttpContext } from "@adonisjs/core/http";

import { BusinessRuleException } from "#exceptions/domain_exceptions";
import Currency from "#models/currency";
import Region from "#models/region";
import type { SettingValueType } from "#models/setting";
import { recordAudit } from "#services/admin_audit_log_service";
import { CacheTags } from "#services/cache_keys";
import { SUPPORTED_COUNTRIES } from "#services/currency_config_service";
import SettingsService from "#services/settings_service";
import { currentTenantId } from "#services/tenant_context";
import { type ProvinceOption, toGeneralSettings } from "#transformers/general_settings_transformer";
import { adminGeneralSettingsUpdateValidator } from "#validators/admin/general_settings_validator";

type SettingGroup = "general" | "tax";

interface PlannedWrite {
    group: SettingGroup;
    key: string;
    value: unknown;
    type: SettingValueType;
    /** Whether this key feeds the public currency config (drives cache invalidation). */
    currency?: boolean;
}

export default class AdminSettingsGeneralController {
    private settings = new SettingsService();

    /** GET /api/v1/admin/settings/general — typed editable settings + option lists. */
    async show() {
        return { data: await this.load() };
    }

    /**
     * PATCH /api/v1/admin/settings/general — partial update. Writes only keys whose value changed
     * (same-value PATCH is a no-op — no write, no audit row); invalidates the public currency cache
     * when a currency-affecting key moves.
     */
    async update(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminGeneralSettingsUpdateValidator);

        const [general, tax, currencies, provinces] = await Promise.all([
            this.settings.all("general"),
            this.settings.all("tax"),
            Currency.query().orderBy("ordering", "asc"),
            this.fetchProvinces(),
        ]);

        const enabledCurrencyCodes = new Set(currencies.filter((c) => c.enabled).map((c) => c.code));
        const provinceCodes = new Set(provinces.map((p) => p.code));
        const countryCodes = new Set(SUPPORTED_COUNTRIES.map((c) => c.code));

        this.assertCrossFieldRules(payload, general, enabledCurrencyCodes, provinceCodes, countryCodes);

        const writes = this.planWrites(payload);
        let changed = false;
        let currencyChanged = false;
        for (const w of writes) {
            const currentValue = (w.group === "general" ? general : tax)[w.key];
            if (valuesEqual(currentValue, w.value)) continue;
            await this.settings.set(w.group, w.key, w.value, w.type);
            changed = true;
            if (w.currency) currencyChanged = true;
        }

        if (currencyChanged) {
            await cache.deleteByTag({ tags: [CacheTags.currency(currentTenantId())] });
        }
        if (changed) {
            await recordAudit({
                ctx,
                action: "settings.general.patch",
                entityKind: "settings",
                entityId: null,
                payload: payload as Record<string, unknown>,
            });
        }

        return { data: await this.load() };
    }

    private async load() {
        const [general, tax, currencies, provinces] = await Promise.all([
            this.settings.all("general"),
            this.settings.all("tax"),
            Currency.query().orderBy("ordering", "asc"),
            this.fetchProvinces(),
        ]);
        return toGeneralSettings({ general, tax, currencies, provinces, countries: SUPPORTED_COUNTRIES });
    }

    /** All 31 IR provinces (parent regions) with fa/en names, ordered by ISO code. */
    private async fetchProvinces(): Promise<ProvinceOption[]> {
        const regions = await Region.query()
            .where("country_code", "IR")
            .whereNull("parent_id")
            .preload("translations")
            .orderBy("code", "asc");
        return regions.map((region) => {
            const fa = region.translations.find((t) => t.locale === "fa")?.name ?? region.code;
            const en = region.translations.find((t) => t.locale === "en")?.name ?? region.code;
            return { code: region.code, nameFa: fa, nameEn: en };
        });
    }

    private assertCrossFieldRules(
        payload: Awaited<ReturnType<typeof adminGeneralSettingsUpdateValidator.validate>>,
        general: Record<string, unknown>,
        enabledCurrencyCodes: Set<string>,
        provinceCodes: Set<string>,
        countryCodes: Set<string>,
    ): void {
        const currency = payload.currency;
        if (currency?.display !== undefined && !enabledCurrencyCodes.has(currency.display)) {
            throw new BusinessRuleException("Display currency is not enabled", "currency.display.disabled", {
                field: "currency.display",
            });
        }

        const thousandSep = currency?.thousand_sep ?? (general.price_thousand_sep as string | undefined) ?? "٬";
        const decimalSep = currency?.decimal_sep ?? (general.price_decimal_sep as string | undefined) ?? ".";
        if (thousandSep === decimalSep) {
            throw new BusinessRuleException("Thousand and decimal separators must differ", "currency.separators.equal", {
                field: "currency.decimal_sep",
            });
        }

        const address = payload.store_address;
        if (address?.country !== undefined && address.country !== "" && !countryCodes.has(address.country)) {
            throw new BusinessRuleException("Unknown country", "store_address.country.unknown", {
                field: "store_address.country",
            });
        }
        if (address?.state !== undefined && address.state !== "" && !provinceCodes.has(address.state)) {
            throw new BusinessRuleException("Unknown province", "store_address.state.unknown", { field: "store_address.state" });
        }

        const options = payload.general_options;
        for (const code of [
            ...(options?.selling_locations_specific ?? []),
            ...(options?.shipping_locations_specific ?? []),
            ...(options?.selling_locations_excluded ?? []),
        ]) {
            if (!countryCodes.has(code)) {
                throw new BusinessRuleException("Unknown country in location list", "general_options.country.unknown", { code });
            }
        }
    }

    private planWrites(payload: Awaited<ReturnType<typeof adminGeneralSettingsUpdateValidator.validate>>): PlannedWrite[] {
        const writes: PlannedWrite[] = [];
        const addr = payload.store_address;
        if (addr) {
            if (addr.address_1 !== undefined)
                writes.push({ group: "general", key: "store_address_1", value: addr.address_1, type: "string" });
            if (addr.address_2 !== undefined)
                writes.push({ group: "general", key: "store_address_2", value: addr.address_2, type: "string" });
            if (addr.city !== undefined) writes.push({ group: "general", key: "store_city", value: addr.city, type: "string" });
            if (addr.state !== undefined)
                writes.push({ group: "general", key: "store_state", value: addr.state, type: "string" });
            if (addr.postcode !== undefined)
                writes.push({ group: "general", key: "store_postcode", value: addr.postcode, type: "string" });
            if (addr.country !== undefined)
                writes.push({ group: "general", key: "country_default", value: addr.country, type: "string" });
        }

        const opts = payload.general_options;
        if (opts) {
            if (opts.selling_locations !== undefined)
                writes.push({ group: "general", key: "selling_locations", value: opts.selling_locations, type: "string" });
            if (opts.selling_locations_specific !== undefined)
                writes.push({
                    group: "general",
                    key: "selling_locations_specific",
                    value: opts.selling_locations_specific,
                    type: "json",
                });
            if (opts.selling_locations_excluded !== undefined)
                writes.push({
                    group: "general",
                    key: "selling_locations_excluded",
                    value: opts.selling_locations_excluded,
                    type: "json",
                });
            if (opts.shipping_locations !== undefined)
                writes.push({ group: "general", key: "shipping_locations", value: opts.shipping_locations, type: "string" });
            if (opts.shipping_locations_specific !== undefined)
                writes.push({
                    group: "general",
                    key: "shipping_locations_specific",
                    value: opts.shipping_locations_specific,
                    type: "json",
                });
            if (opts.default_customer_location !== undefined)
                writes.push({
                    group: "general",
                    key: "default_customer_location",
                    value: opts.default_customer_location,
                    type: "string",
                });
        }

        const tc = payload.taxes_and_coupons;
        if (tc) {
            if (tc.taxes_enabled !== undefined)
                writes.push({ group: "tax", key: "enabled", value: tc.taxes_enabled, type: "boolean" });
            if (tc.coupons_enabled !== undefined)
                writes.push({ group: "tax", key: "coupons_enabled", value: tc.coupons_enabled, type: "boolean" });
            if (tc.calc_discounts_sequentially !== undefined)
                writes.push({
                    group: "tax",
                    key: "calc_discounts_sequentially",
                    value: tc.calc_discounts_sequentially,
                    type: "boolean",
                });
        }

        const cur = payload.currency;
        if (cur) {
            if (cur.display !== undefined)
                writes.push({
                    group: "general",
                    key: "currency_display_default",
                    value: cur.display,
                    type: "string",
                    currency: true,
                });
            if (cur.position !== undefined)
                writes.push({ group: "general", key: "currency_position", value: cur.position, type: "string", currency: true });
            if (cur.thousand_sep !== undefined)
                writes.push({
                    group: "general",
                    key: "price_thousand_sep",
                    value: cur.thousand_sep,
                    type: "string",
                    currency: true,
                });
            if (cur.decimal_sep !== undefined)
                writes.push({
                    group: "general",
                    key: "price_decimal_sep",
                    value: cur.decimal_sep,
                    type: "string",
                    currency: true,
                });
            if (cur.num_decimals !== undefined)
                writes.push({
                    group: "general",
                    key: "price_num_decimals",
                    value: cur.num_decimals,
                    type: "number",
                    currency: true,
                });
        }

        return writes;
    }
}

/** Order-sensitive equality good enough for settings primitives + small string arrays. */
function valuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
    return false;
}
