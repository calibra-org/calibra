import testUtils from "@adonisjs/core/services/test_utils";
import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import PaymentGateway from "#models/payment_gateway";
import Region from "#models/region";
import RegionTranslation from "#models/region_translation";
import Setting from "#models/setting";
import ShippingZone from "#models/shipping_zone";
import TaxClass from "#models/tax_class";
import TaxRate from "#models/tax_rate";

test.group("Foundation seeder", (group) => {
    group.each.setup(async () => {
        const cleanup = await testUtils.db().truncate();
        await testUtils.db().seed();
        return cleanup;
    });

    test("seeds 31 Iran provinces, each with fa and en translations", async ({ assert }) => {
        const iranProvinces = await Region.query().where("country_code", "IR").whereNull("parent_id");
        assert.equal(iranProvinces.length, 31);

        for (const province of iranProvinces) {
            const translations = await RegionTranslation.query().where("region_id", String(province.id));
            const locales = translations.map((row) => row.locale).sort();
            assert.deepEqual(locales, ["en", "fa"], `province ${province.code} missing fa/en translations`);
        }
    });

    test("seeds the standard tax class with slug 'standard'", async ({ assert }) => {
        const standard = await TaxClass.findBy("slug", "standard");
        assert.isNotNull(standard);
        assert.equal(standard?.slug, "standard");
    });

    test("seeds the Iran VAT rate at 10% with no region_id", async ({ assert }) => {
        const standard = await TaxClass.findByOrFail("slug", "standard");
        const rate = await TaxRate.query().where("tax_class_id", String(standard.id)).where("country", "IR").first();

        assert.isNotNull(rate);
        assert.equal(Number.parseFloat(rate?.rate ?? "0"), 10);
        assert.isNull(rate?.regionId);
    });

    test("seeds both shipping zones with exactly one is_fallback row", async ({ assert }) => {
        const zones = await ShippingZone.all();
        assert.equal(zones.length, 2);

        const fallback = zones.filter((zone) => zone.isFallback);
        assert.equal(fallback.length, 1);
    });

    test("seeds all seven payment gateways with the expected codes", async ({ assert }) => {
        const gateways = await PaymentGateway.all();
        const codes = gateways.map((gateway) => gateway.code).sort();
        assert.deepEqual(codes, ["bank_transfer", "cod", "idpay", "nextpay", "payir", "zarinpal", "zibal"]);
    });

    test("seeds the critical settings", async ({ assert }) => {
        const required = [
            { group: "general", key: "currency", value: "IRR" },
            { group: "tax", key: "prices_include_tax", value: true },
            { group: "inventory", key: "hold_stock_minutes", value: 60 },
        ];

        for (const { group: g, key, value } of required) {
            const row = await Setting.query().where("group_key", g).where("key", key).first();
            assert.isNotNull(row, `setting ${g}.${key} missing`);
            assert.deepEqual(row?.value, value);
        }
    });

    test("running the seeder twice does not duplicate rows", async ({ assert }) => {
        const countOf = async (table: string): Promise<number> => {
            const rows = (await db.from(table).count("* as count")) as Array<{ count: string | number }>;
            return Number(rows[0]?.count ?? 0);
        };

        /** Province baseline = top-level IR regions only (cities/counties are seeded under a parent). */
        const provinceCount = async (): Promise<number> => {
            const rows = (await db
                .from("regions")
                .where("country_code", "IR")
                .whereNull("parent_id")
                .count("* as count")) as Array<{ count: string | number }>;
            return Number(rows[0]?.count ?? 0);
        };

        const before = {
            regions: await countOf("regions"),
            provinces: await provinceCount(),
            translations: await countOf("region_translations"),
            settings: await countOf("settings"),
            gateways: await countOf("payment_gateways"),
        };

        await testUtils.db().seed();

        const after = {
            regions: await countOf("regions"),
            provinces: await provinceCount(),
            translations: await countOf("region_translations"),
            settings: await countOf("settings"),
            gateways: await countOf("payment_gateways"),
        };

        assert.equal(before.provinces, 31);
        assert.equal(after.regions, before.regions);
        assert.equal(after.provinces, before.provinces);
        assert.equal(after.translations, before.translations);
        assert.equal(after.settings, before.settings);
        assert.equal(after.gateways, before.gateways);
    });

    test("regions table is country-scoped — inserting a US row succeeds without a migration", async ({ assert }) => {
        const beforeRows = (await db.from("regions").count("* as count")) as Array<{ count: string | number }>;
        const before = Number(beforeRows[0]?.count ?? 0);

        const usRegion = await Region.create({
            countryCode: "US",
            code: "US-CA",
            ordering: 1,
            attributes: {},
        });

        assert.equal(usRegion.countryCode, "US");
        assert.equal(usRegion.code, "US-CA");

        const afterRows = (await db.from("regions").count("* as count")) as Array<{ count: string | number }>;
        assert.equal(Number(afterRows[0]?.count), before + 1);
    });
});
