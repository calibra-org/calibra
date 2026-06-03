import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import { enumerateShippingRates } from "#services/shipping_rate_service";
import { runInTestTenant } from "#tests/helpers/tenant";

async function seedFoundationFixtures() {
    /** Run the foundation seeder so phase-04 tests see the same baseline as a fresh deployment. */
    const FoundationSeeder = (await import("#database/seed_modules/0001_foundation_seeder")).default;
    const seeder = new FoundationSeeder(db.connection());
    await seeder.run();
}

async function purgeCarts() {
    await db.rawQuery("TRUNCATE TABLE carts RESTART IDENTITY CASCADE");
}

test.group("shipping_rate_service", (group) => {
    group.each.setup(async () => {
        await purgeCarts();
        await seedFoundationFixtures();
    });

    test("IR address returns the Iran zone's methods", async ({ assert }) => {
        const options = await runInTestTenant(() => enumerateShippingRates({ country: "IR", regionId: null, postcode: null }, 10_000_000));
        const codes = options.map((option) => option.methodCode).sort();
        assert.deepInclude(codes, "post_pishtaz");
        assert.deepInclude(codes, "post_sefareshi");
        assert.deepInclude(codes, "tipax");
    });

    test("free_shipping only appears once items_total meets min_amount", async ({ assert }) => {
        const belowMin = await runInTestTenant(() => enumerateShippingRates({ country: "IR", regionId: null, postcode: null }, 1_000_000));
        assert.notInclude(
            belowMin.map((o) => o.methodCode),
            "free_shipping",
        );

        const aboveMin = await runInTestTenant(() => enumerateShippingRates({ country: "IR", regionId: null, postcode: null }, 100_000_000));
        const freeOption = aboveMin.find((o) => o.methodCode === "free_shipping");
        assert.exists(freeOption);
        assert.equal(freeOption?.cost, 0);
    });

    test("foreign address falls through to the fallback zone", async ({ assert }) => {
        const options = await runInTestTenant(() => enumerateShippingRates({ country: "US", regionId: null, postcode: null }, 10_000_000));
        /** Foundation seed leaves the fallback zone without methods — confirm we return an empty list, not the IR set. */
        const codes = options.map((option) => option.methodCode);
        assert.notInclude(codes, "tipax");
    });

    test("a postcode-specific zone wins over the country-level zone", async ({ assert }) => {
        /**
         * Pick a postcode that no other test cares about — `1234567890` is the canonical Iran-IR
         * test postcode shared by the cart/orders helpers, and `seedFoundationFixtures` doesn't
         * truncate the extras this test inserts, so any spec running afterwards with the same
         * postcode would inherit a `flat_rate`-only zone.
         */
        const SYNTHETIC_POSTCODE = "9999987654";
        const zoneId = await db.table("shipping_zones").insert({ name: "Tehran VIP", is_fallback: false }).returning("id");
        const zonePk = Number((zoneId[0] as { id: bigint | number }).id);
        await db.table("shipping_zone_locations").insert({ zone_id: zonePk, type: "postcode", code: SYNTHETIC_POSTCODE });

        const methodRow = await db.from("shipping_methods").where("code", "flat_rate").select("id").first();
        const methodId = Number(methodRow?.id);
        await db.table("shipping_zone_methods").insert({
            zone_id: zonePk,
            method_id: methodId,
            title_override: "Tehran VIP same-day",
            enabled: true,
            ordering: 1,
            settings: JSON.stringify({ cost: 250_000 }),
        });

        const options = await runInTestTenant(() => enumerateShippingRates({ country: "IR", regionId: null, postcode: SYNTHETIC_POSTCODE }, 10_000_000));
        const codes = options.map((option) => option.methodCode).sort();
        /** Tehran VIP is the only method in the postcode zone — Iran-zone methods must not appear. */
        assert.deepEqual(codes, ["flat_rate"]);
    });
});
