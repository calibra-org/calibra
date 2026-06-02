import { BaseSeeder } from "@adonisjs/lucid/seeders";
import { DateTime } from "luxon";

import PaymentGateway from "#models/payment_gateway";
import Region from "#models/region";
import ShippingMethod from "#models/shipping_method";
import ShippingZone from "#models/shipping_zone";
import ShippingZoneLocation from "#models/shipping_zone_location";
import ShippingZoneMethod from "#models/shipping_zone_method";
import TaxClass from "#models/tax_class";
import TaxRate from "#models/tax_rate";

/**
 * Phase 01 seed data — Iran's 31 ISO-3166-2:IR provinces, the tax/shipping/payment scaffolding, and
 * the default settings catalog. Every write goes through `updateOrCreate` (or `onConflict.merge()`
 * for tables with composite primary keys) so running the seeder twice produces the same database
 * state with no duplicate rows.
 *
 * Lives under `database/seed_modules/` (outside Lucid's auto-discovery path) so it runs only when
 * the orchestrating `MainSeeder` imports it explicitly.
 */
export default class FoundationSeeder extends BaseSeeder {
    async run() {
        await this.seedGlobalReference();

        const taxClassesBySlug = await this.seedTaxClasses();
        await this.seedTaxRates(taxClassesBySlug);

        const zonesByName = await this.seedShippingZones();
        await this.seedShippingZoneLocations(zonesByName);

        const methodsByCode = await this.seedShippingMethods();
        await this.seedShippingZoneMethods(zonesByName, methodsByCode);

        await this.seedPaymentGateways();
        await this.seedSettings();
    }

    /**
     * Seed the GLOBAL reference data only — the ISO-3166-2:IR provinces and their translations.
     * `regions` / `region_translations` carry no `tenant_id` (they sit outside RLS), so they are
     * shared across every tenant and seeded once. `MainSeeder` calls this before provisioning tenants;
     * {@link run} also calls it so the per-tenant test fixtures (cart helpers) still get provinces.
     */
    async seedGlobalReference(): Promise<void> {
        const regionsByCode = await this.seedRegions();
        await this.seedRegionTranslations(regionsByCode);
    }

    private async seedRegions(): Promise<Map<string, Region>> {
        const rows = IRAN_REGIONS.map((region, index) => ({
            countryCode: "IR",
            code: region.code,
            ordering: index + 1,
            attributes: {},
        }));

        await Region.updateOrCreateMany(["countryCode", "code"], rows, { client: this.client });

        const regions = await Region.query({ client: this.client }).where("country_code", "IR");
        const byCode = new Map<string, Region>();
        for (const region of regions) byCode.set(region.code, region);
        return byCode;
    }

    private async seedRegionTranslations(regionsByCode: Map<string, Region>): Promise<void> {
        const now = DateTime.utc().toSQL();
        const translations: Array<{
            region_id: bigint | number;
            locale: string;
            name: string;
            created_at: string | null;
            updated_at: string | null;
        }> = [];

        for (const region of IRAN_REGIONS) {
            const row = regionsByCode.get(region.code);
            if (!row) continue;
            translations.push(
                { region_id: row.id, locale: "fa", name: region.fa, created_at: now, updated_at: now },
                { region_id: row.id, locale: "en", name: region.en, created_at: now, updated_at: now },
            );
        }

        await this.client
            .table("region_translations")
            .insert(translations)
            .onConflict(["region_id", "locale"])
            .merge(["name", "updated_at"]);
    }

    private async seedTaxClasses(): Promise<Map<string, TaxClass>> {
        const rows = [
            { slug: "standard", name: "استاندارد" },
            { slug: "reduced-rate", name: "نرخ کاهش‌یافته" },
            { slug: "zero-rate", name: "نرخ صفر" },
        ];

        await TaxClass.updateOrCreateMany("slug", rows, { client: this.client });

        const classes = await TaxClass.query({ client: this.client });
        const bySlug = new Map<string, TaxClass>();
        for (const taxClass of classes) bySlug.set(taxClass.slug, taxClass);
        return bySlug;
    }

    private async seedTaxRates(taxClassesBySlug: Map<string, TaxClass>): Promise<void> {
        const standard = taxClassesBySlug.get("standard");
        if (!standard) throw new Error("standard tax class missing — seed order is wrong");

        await TaxRate.updateOrCreate(
            { taxClassId: standard.id, country: "IR" },
            {
                taxClassId: standard.id,
                country: "IR",
                regionId: null,
                postcodes: null,
                cities: null,
                rate: "10.0000",
                label: "مالیات بر ارزش افزوده",
                priority: 1,
                compound: false,
                appliesToShipping: false,
                ordering: 0,
            },
            { client: this.client },
        );
    }

    private async seedShippingZones(): Promise<Map<string, ShippingZone>> {
        const rows = [
            { name: "ایران", isFallback: false },
            { name: "سایر نقاط جهان", isFallback: true },
        ];

        await ShippingZone.updateOrCreateMany("name", rows, { client: this.client });

        const zones = await ShippingZone.query({ client: this.client });
        const byName = new Map<string, ShippingZone>();
        for (const zone of zones) byName.set(zone.name, zone);
        return byName;
    }

    private async seedShippingZoneLocations(zonesByName: Map<string, ShippingZone>): Promise<void> {
        const iranZone = zonesByName.get("ایران");
        if (!iranZone) throw new Error("Iran shipping zone missing — seed order is wrong");

        await ShippingZoneLocation.firstOrCreate(
            { zoneId: iranZone.id, type: "country", code: "IR" },
            { zoneId: iranZone.id, type: "country", code: "IR" },
            { client: this.client },
        );
    }

    private async seedShippingMethods(): Promise<Map<string, ShippingMethod>> {
        const rows = [
            {
                code: "flat_rate",
                titleDefault: "ارسال با نرخ ثابت",
                descriptionDefault: "هزینه ارسال ثابت بدون توجه به محل تحویل",
                settingsSchema: { cost: { type: "number", required: true } },
            },
            {
                code: "free_shipping",
                titleDefault: "ارسال رایگان",
                descriptionDefault: "ارسال رایگان در صورت رسیدن سبد به حداقل مبلغ",
                settingsSchema: { min_amount: { type: "number", required: false } },
            },
            {
                code: "local_pickup",
                titleDefault: "تحویل حضوری",
                descriptionDefault: "تحویل سفارش از محل فروشگاه",
                settingsSchema: { cost: { type: "number", required: false } },
            },
            {
                code: "post_pishtaz",
                titleDefault: "پست پیشتاز",
                descriptionDefault: "ارسال با پست پیشتاز شرکت ملی پست",
                settingsSchema: { cost: { type: "number", required: true } },
            },
            {
                code: "post_sefareshi",
                titleDefault: "پست سفارشی",
                descriptionDefault: "ارسال با پست سفارشی شرکت ملی پست",
                settingsSchema: { cost: { type: "number", required: true } },
            },
            {
                code: "tipax",
                titleDefault: "تیپاکس",
                descriptionDefault: "ارسال پس‌کرایه با شرکت تیپاکس",
                settingsSchema: { cost: { type: "number", required: true } },
            },
        ];

        await ShippingMethod.updateOrCreateMany("code", rows, { client: this.client });

        const methods = await ShippingMethod.query({ client: this.client });
        const byCode = new Map<string, ShippingMethod>();
        for (const method of methods) byCode.set(method.code, method);
        return byCode;
    }

    private async seedShippingZoneMethods(
        zonesByName: Map<string, ShippingZone>,
        methodsByCode: Map<string, ShippingMethod>,
    ): Promise<void> {
        const iranZone = zonesByName.get("ایران");
        if (!iranZone) throw new Error("Iran shipping zone missing");

        const assignments = [
            { methodCode: "post_pishtaz", settings: { cost: 500_000 }, ordering: 1 },
            { methodCode: "post_sefareshi", settings: { cost: 350_000 }, ordering: 2 },
            { methodCode: "tipax", settings: { cost: 800_000 }, ordering: 3 },
            { methodCode: "free_shipping", settings: { min_amount: 50_000_000 }, ordering: 4 },
        ];

        for (const { methodCode, settings, ordering } of assignments) {
            const method = methodsByCode.get(methodCode);
            if (!method) throw new Error(`shipping method ${methodCode} missing`);

            await ShippingZoneMethod.updateOrCreate(
                { zoneId: iranZone.id, methodId: method.id },
                { zoneId: iranZone.id, methodId: method.id, enabled: true, ordering, settings },
                { client: this.client },
            );
        }
    }

    private async seedPaymentGateways(): Promise<void> {
        /**
         * `signed_callback` reflects each PSP's actual posture. None of the Iranian gateways
         * we ship sign their redirect-hop callbacks today — replay protection comes from the
         * `processed_webhook_events` ledger + amount guard + `order:<id>` lock instead. If a
         * gateway adds HMAC support upstream, flip this to `true` and populate
         * `webhook_secret_env_key` / `webhook_signature_header` so the middleware kicks in.
         */
        /**
         * `attributes.implementation_status` records the actual posture of each adapter:
         *
         * - `"stub"` — the platform knows about the PSP, the registry resolves it, but every
         *   lifecycle method throws `E_GATEWAY_NOT_IMPLEMENTED`. The admin UI surfaces a "not
         *   implemented" badge and the validator refuses `enabled: true` until the status flips.
         * - `"live"` — the adapter is a real integration (offline gateways today: `cod`,
         *   `bank_transfer`). A future PSP integration phase ships a real adapter and updates
         *   this row to `"live"` in the same PR that wires the integration.
         */
        const gateways = [
            {
                code: "zarinpal",
                enabled: false,
                ordering: 1,
                settings: { merchant_id: "" },
                supports: { refunds: false },
                signedCallback: false,
                webhookSecretEnvKey: null,
                webhookSignatureHeader: null,
                attributes: { implementation_status: "stub" },
            },
            {
                code: "idpay",
                enabled: false,
                ordering: 2,
                settings: { api_key: "" },
                supports: { refunds: true },
                signedCallback: false,
                webhookSecretEnvKey: null,
                webhookSignatureHeader: null,
                attributes: { implementation_status: "stub" },
            },
            {
                code: "nextpay",
                enabled: false,
                ordering: 3,
                settings: { api_key: "" },
                supports: { refunds: false },
                signedCallback: false,
                webhookSecretEnvKey: null,
                webhookSignatureHeader: null,
                attributes: { implementation_status: "stub" },
            },
            {
                code: "payir",
                enabled: false,
                ordering: 4,
                settings: { api_key: "" },
                supports: { refunds: true },
                signedCallback: false,
                webhookSecretEnvKey: null,
                webhookSignatureHeader: null,
                attributes: { implementation_status: "stub" },
            },
            {
                code: "zibal",
                enabled: false,
                ordering: 5,
                settings: { merchant_id: "" },
                supports: { refunds: true },
                signedCallback: false,
                webhookSecretEnvKey: null,
                webhookSignatureHeader: null,
                attributes: { implementation_status: "stub" },
            },
            {
                code: "cod",
                enabled: true,
                ordering: 6,
                settings: {},
                supports: { refunds: false },
                signedCallback: false,
                webhookSecretEnvKey: null,
                webhookSignatureHeader: null,
                attributes: { implementation_status: "live" },
            },
            {
                code: "bank_transfer",
                enabled: true,
                ordering: 7,
                settings: { iban: "", account_name: "" },
                supports: { refunds: false },
                signedCallback: false,
                webhookSecretEnvKey: null,
                webhookSignatureHeader: null,
                attributes: { implementation_status: "live" },
            },
        ];

        await PaymentGateway.updateOrCreateMany("code", gateways, { client: this.client });
    }

    private async seedSettings(): Promise<void> {
        const now = DateTime.utc().toSQL();
        const rows: Array<{
            group_key: string;
            key: string;
            value: string;
            type: string;
            created_at: string | null;
            updated_at: string | null;
        }> = SETTINGS.map(({ group, key, value, type }) => ({
            group_key: group,
            key,
            value: JSON.stringify(value),
            type,
            created_at: now,
            updated_at: now,
        }));

        await this.client
            .table("settings")
            .insert(rows)
            .onConflict(["tenant_id", "group_key", "key"])
            .merge(["value", "type", "updated_at"]);
    }
}

interface IranRegion {
    code: string;
    fa: string;
    en: string;
}

/**
 * ISO-3166-2:IR — the authoritative numeric subdivision codes for Iran's 31 provinces, ordered by
 * code. Persian and English names are paired so the translation seeder can spread one row per
 * locale without re-iterating the list.
 *
 * Source: ISO Online Browsing Platform, code list for IR (https://www.iso.org/obp/ui/#iso:code:3166:IR).
 */
const IRAN_REGIONS: IranRegion[] = [
    { code: "IR-01", fa: "مرکزی", en: "Markazi" },
    { code: "IR-02", fa: "گیلان", en: "Gilan" },
    { code: "IR-03", fa: "مازندران", en: "Mazandaran" },
    { code: "IR-04", fa: "آذربایجان شرقی", en: "East Azerbaijan" },
    { code: "IR-05", fa: "آذربایجان غربی", en: "West Azerbaijan" },
    { code: "IR-06", fa: "کرمانشاه", en: "Kermanshah" },
    { code: "IR-07", fa: "خوزستان", en: "Khuzestan" },
    { code: "IR-08", fa: "فارس", en: "Fars" },
    { code: "IR-09", fa: "کرمان", en: "Kerman" },
    { code: "IR-10", fa: "خراسان رضوی", en: "Razavi Khorasan" },
    { code: "IR-11", fa: "اصفهان", en: "Isfahan" },
    { code: "IR-12", fa: "سیستان و بلوچستان", en: "Sistan and Baluchestan" },
    { code: "IR-13", fa: "کردستان", en: "Kurdistan" },
    { code: "IR-14", fa: "همدان", en: "Hamadan" },
    { code: "IR-15", fa: "چهارمحال و بختیاری", en: "Chaharmahal and Bakhtiari" },
    { code: "IR-16", fa: "لرستان", en: "Lorestan" },
    { code: "IR-17", fa: "ایلام", en: "Ilam" },
    { code: "IR-18", fa: "کهگیلویه و بویراحمد", en: "Kohgiluyeh and Boyer-Ahmad" },
    { code: "IR-19", fa: "بوشهر", en: "Bushehr" },
    { code: "IR-20", fa: "زنجان", en: "Zanjan" },
    { code: "IR-21", fa: "سمنان", en: "Semnan" },
    { code: "IR-22", fa: "یزد", en: "Yazd" },
    { code: "IR-23", fa: "هرمزگان", en: "Hormozgan" },
    { code: "IR-24", fa: "تهران", en: "Tehran" },
    { code: "IR-25", fa: "اردبیل", en: "Ardabil" },
    { code: "IR-26", fa: "قم", en: "Qom" },
    { code: "IR-27", fa: "قزوین", en: "Qazvin" },
    { code: "IR-28", fa: "گلستان", en: "Golestan" },
    { code: "IR-29", fa: "خراسان شمالی", en: "North Khorasan" },
    { code: "IR-30", fa: "خراسان جنوبی", en: "South Khorasan" },
    { code: "IR-31", fa: "البرز", en: "Alborz" },
];

interface SettingRow {
    group: string;
    key: string;
    value: unknown;
    type: "string" | "number" | "boolean" | "json";
}

const SETTINGS: SettingRow[] = [
    { group: "general", key: "currency", value: "IRR", type: "string" },
    { group: "general", key: "currency_display_default", value: "IRT", type: "string" },
    { group: "general", key: "country_default", value: "IR", type: "string" },
    { group: "general", key: "locale_default", value: "fa", type: "string" },
    /**
     * Store address (WooCommerce General → Store Address). `store_state` holds a region code
     * (`IR-NN`) or "" — resolved against the seeded IR provinces in the `regions` table.
     */
    { group: "general", key: "store_address_1", value: "", type: "string" },
    { group: "general", key: "store_address_2", value: "", type: "string" },
    { group: "general", key: "store_city", value: "", type: "string" },
    { group: "general", key: "store_state", value: "", type: "string" },
    { group: "general", key: "store_postcode", value: "", type: "string" },
    /**
     * General options (WC selling/shipping locations + default customer location). Iran-only
     * scope: selling defaults to the specific country list `["IR"]`; the model extends to more
     * countries without a migration.
     */
    { group: "general", key: "selling_locations", value: "specific", type: "string" },
    { group: "general", key: "selling_locations_specific", value: ["IR"], type: "json" },
    { group: "general", key: "selling_locations_excluded", value: [], type: "json" },
    { group: "general", key: "shipping_locations", value: "", type: "string" },
    { group: "general", key: "shipping_locations_specific", value: ["IR"], type: "json" },
    { group: "general", key: "default_customer_location", value: "base", type: "string" },
    /**
     * Currency display config (WC Currency options). `currency` above is the immutable stored
     * BASE; `currency_display_default` is the chosen DISPLAY currency (WC `woocommerce_currency`).
     * The four format knobs override the display currency's reference-row defaults.
     */
    { group: "general", key: "currency_position", value: "right_space", type: "string" },
    { group: "general", key: "price_thousand_sep", value: "٬", type: "string" },
    { group: "general", key: "price_decimal_sep", value: ".", type: "string" },
    { group: "general", key: "price_num_decimals", value: 0, type: "number" },
    { group: "tax", key: "prices_include_tax", value: true, type: "boolean" },
    { group: "tax", key: "display_shop", value: "incl", type: "string" },
    { group: "tax", key: "display_cart", value: "incl", type: "string" },
    /** Taxes & coupons toggles (WC General → Taxes and coupons). */
    { group: "tax", key: "enabled", value: true, type: "boolean" },
    { group: "tax", key: "coupons_enabled", value: true, type: "boolean" },
    { group: "tax", key: "calc_discounts_sequentially", value: false, type: "boolean" },
    { group: "inventory", key: "hold_stock_minutes", value: 60, type: "number" },
    /**
     * Global fallback when an `inventory_items.low_stock_threshold` row leaves its threshold
     * null. Operators override this from Settings → Inventory. 5 matches the WooCommerce default;
     * the threshold travels with the product row so each business can also set per-product values.
     */
    { group: "inventory", key: "low_stock_threshold_default", value: 5, type: "number" },
    { group: "inventory", key: "cart_abandonment_days", value: 30, type: "number" },
    { group: "orders", key: "draft_expiry_hours", value: 24, type: "number" },
    { group: "orders", key: "number_format", value: "{id}", type: "string" },
    { group: "general", key: "checkout_return_url_success", value: "http://localhost:3000/checkout/success", type: "string" },
    { group: "general", key: "checkout_return_url_failed", value: "http://localhost:3000/checkout/failed", type: "string" },
    { group: "payments", key: "callback_base_url", value: "http://localhost:3333", type: "string" },
    /**
     * Date & Time formats (Settings → Date & Time). Stored as date-fns format patterns; the admin
     * renders them per active calendar (Jalali for `fa`, Gregorian for `en`). `d MMMM yyyy` →
     * "۱۰ خرداد ۱۴۰۵"; `HH:mm` → "۱۲:۳۳".
     */
    { group: "datetime", key: "date_format", value: "d MMMM yyyy", type: "string" },
    { group: "datetime", key: "time_format", value: "HH:mm", type: "string" },
    /**
     * Media image sizes + upload organization (Settings → Media). Widths/heights in pixels;
     * `thumbnail_crop` hard-crops to exact dimensions (others are max-bound). `organize_uploads_by_date`
     * toggles the `{yyyy}/{mm}` folder layout. `max_upload_mb` caps a single upload.
     */
    { group: "media", key: "thumbnail_width", value: 150, type: "number" },
    { group: "media", key: "thumbnail_height", value: 150, type: "number" },
    { group: "media", key: "thumbnail_crop", value: true, type: "boolean" },
    { group: "media", key: "medium_width", value: 300, type: "number" },
    { group: "media", key: "medium_height", value: 300, type: "number" },
    { group: "media", key: "large_width", value: 1024, type: "number" },
    { group: "media", key: "large_height", value: 1024, type: "number" },
    { group: "media", key: "organize_uploads_by_date", value: true, type: "boolean" },
    { group: "media", key: "max_upload_mb", value: 20, type: "number" },
];
