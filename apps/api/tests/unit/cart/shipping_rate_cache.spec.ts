import cache from "@adonisjs/cache/services/main";
import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import { CacheTags } from "#services/cache_keys";
import { enumerateShippingRates } from "#services/shipping_rate_service";

async function seedFoundationFixtures() {
    const FoundationSeeder = (await import("#database/seed_modules/0001_foundation_seeder")).default;
    const seeder = new FoundationSeeder(db.connection());
    await seeder.run();
}

async function purgeCarts() {
    await db.rawQuery("TRUNCATE TABLE carts RESTART IDENTITY CASCADE");
}

test.group("shipping_rate_service caching", (group) => {
    group.each.setup(async () => {
        await purgeCarts();
        await seedFoundationFixtures();
    });

    test("warm hit serves cached options; tag invalidation refreshes the list", async ({ assert }) => {
        const first = await enumerateShippingRates({ country: "IR", regionId: null, postcode: null }, 10_000_000);
        const firstIds = first.map((o) => o.id).sort();
        assert.isAtLeast(first.length, 1, "foundation seed should expose at least one Iran-zone method");

        /** Disable every Iran-zone method directly in the DB — cached response should still return them. */
        await db.from("shipping_zone_methods").update({ enabled: false });

        const warm = await enumerateShippingRates({ country: "IR", regionId: null, postcode: null }, 10_000_000);
        const warmIds = warm.map((o) => o.id).sort();
        assert.deepEqual(warmIds, firstIds, "warm hit must return the cached list, not a fresh DB read");

        await cache.deleteByTag({ tags: [CacheTags.shippingZones] });

        const refreshed = await enumerateShippingRates({ country: "IR", regionId: null, postcode: null }, 10_000_000);
        assert.equal(refreshed.length, 0, "after invalidation the factory must see the disabled rows");
    });

    test("itemsTotal bucketing — carts in the same 10_000-minor bucket share a key", async ({ assert }) => {
        /** Both 50_001 and 59_999 floor to the 50_000 bucket; second call should serve the cached result. */
        const first = await enumerateShippingRates({ country: "IR", regionId: null, postcode: null }, 50_001);
        assert.isArray(first);

        await db.from("shipping_zone_methods").update({ enabled: false });

        const second = await enumerateShippingRates({ country: "IR", regionId: null, postcode: null }, 59_999);
        assert.equal(second.length, first.length, "different but same-bucket itemsTotal should share a cache key");
    });
});
