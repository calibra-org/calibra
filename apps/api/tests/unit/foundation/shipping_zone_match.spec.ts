import testUtils from "@adonisjs/core/services/test_utils";
import { test } from "@japa/runner";

import ShippingZone from "#models/shipping_zone";
import ShippingZoneLocation from "#models/shipping_zone_location";
import { matchShippingZone } from "#services/shipping_zone_match";

async function createZone(name: string, isFallback = false): Promise<ShippingZone> {
    return ShippingZone.create({ name, isFallback });
}

async function attachLocation(zone: ShippingZone, type: string, code: string): Promise<void> {
    await ShippingZoneLocation.create({ zoneId: zone.id, type, code });
}

test.group("matchShippingZone", (group) => {
    group.each.setup(() => testUtils.db().truncate());

    test("postcode match beats state match", async ({ assert }) => {
        const stateZone = await createZone("State zone");
        await attachLocation(stateZone, "state", "IR-24");

        const postcodeZone = await createZone("Postcode zone");
        await attachLocation(postcodeZone, "postcode", "1234567890");

        await createZone("Fallback", true);

        const matched = await matchShippingZone({
            country: "IR",
            regionCode: "IR-24",
            postcode: "1234567890",
        });

        assert.equal(matched?.id, postcodeZone.id);
    });

    test("state match beats country match", async ({ assert }) => {
        const countryZone = await createZone("Country zone");
        await attachLocation(countryZone, "country", "IR");

        const stateZone = await createZone("State zone");
        await attachLocation(stateZone, "state", "IR-24");

        await createZone("Fallback", true);

        const matched = await matchShippingZone({
            country: "IR",
            regionCode: "IR-24",
        });

        assert.equal(matched?.id, stateZone.id);
    });

    test("country match beats continent match", async ({ assert }) => {
        const continentZone = await createZone("Continent zone");
        await attachLocation(continentZone, "continent", "AS");

        const countryZone = await createZone("Country zone");
        await attachLocation(countryZone, "country", "IR");

        await createZone("Fallback", true);

        const matched = await matchShippingZone({
            country: "IR",
            continent: "AS",
        });

        assert.equal(matched?.id, countryZone.id);
    });

    test("no location match falls through to the is_fallback=true zone", async ({ assert }) => {
        const iranZone = await createZone("Iran");
        await attachLocation(iranZone, "country", "IR");

        const fallback = await createZone("Rest of World", true);

        const matched = await matchShippingZone({
            country: "DE",
            regionCode: "DE-BE",
            postcode: "10115",
        });

        assert.equal(matched?.id, fallback.id);
    });

    test("multiple postcode matches resolve to the lowest zone_id", async ({ assert }) => {
        const firstZone = await createZone("First postcode zone");
        await attachLocation(firstZone, "postcode", "1234567890");

        const secondZone = await createZone("Second postcode zone");
        await attachLocation(secondZone, "postcode", "1234567890");

        await createZone("Fallback", true);

        const matched = await matchShippingZone({
            country: "IR",
            postcode: "1234567890",
        });

        assert.equal(matched?.id, firstZone.id);
    });
});
