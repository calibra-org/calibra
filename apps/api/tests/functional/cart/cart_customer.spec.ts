import { test } from "@japa/runner";

import Region from "#models/region";
import { createTaxableProduct, resetWithFoundation } from "#tests/helpers/cart";

/**
 * Resolve a region id by ISO subdivision code. The id-as-FK assertion is more brittle than the
 * code lookup because `testUtils.db().truncate()` (used by the foundation seeder test) can shift
 * region row ids between runs — the code stays stable.
 */
async function regionId(code: string): Promise<number> {
    const region = await Region.findByOrFail("code", code);
    return Number(region.id);
}

function tokenFromResponse(response: { cookie(name: string): { value: unknown } | undefined }): string {
    const cookie = response.cookie("cart_token");
    if (!cookie || typeof cookie.value !== "string") {
        throw new Error("expected cart_token cookie on response");
    }
    return cookie.value;
}

test.group("POST /api/v1/cart/customer", (group) => {
    group.each.setup(async () => {
        await resetWithFoundation();
    });

    test("setting an IR address recomputes totals with extracted VAT", async ({ client, assert }) => {
        const product = await createTaxableProduct({ regularPrice: 11_000_000 });
        const tehranId = await regionId("IR-24");
        const seeded = await client.post("/api/v1/cart/items").json({ product_id: Number(product.id), quantity: 1 });
        const token = tokenFromResponse(seeded);

        const response = await client
            .post("/api/v1/cart/customer")
            .cookie("cart_token", token)
            .json({ country: "IR", region_id: tehranId, postcode: "1234567890" });

        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body();
        assert.equal(body.data.address.country, "IR");
        assert.equal(body.data.address.region_id, tehranId);
        assert.equal(body.data.totals.items_total, 10_000_000);
        assert.equal(body.data.totals.tax_total, 1_000_000);
        assert.equal(body.data.totals.grand_total, 11_000_000);
    });

    test("setting a US address yields zero tax with no IR tax rate hit", async ({ client, assert }) => {
        const product = await createTaxableProduct({ regularPrice: 5_000_000 });
        const seeded = await client.post("/api/v1/cart/items").json({ product_id: Number(product.id), quantity: 2 });
        const token = tokenFromResponse(seeded);

        const response = await client.post("/api/v1/cart/customer").cookie("cart_token", token).json({ country: "US" });

        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body();
        assert.equal(body.data.address.country, "US");
        assert.equal(body.data.totals.tax_total, 0);
        assert.equal(body.data.totals.items_total, 10_000_000);
    });

    test("missing region for IR is rejected with 422", async ({ client }) => {
        const seeded = await client.get("/api/v1/cart");
        const token = tokenFromResponse(seeded);

        const response = await client
            .post("/api/v1/cart/customer")
            .cookie("cart_token", token)
            .json({ country: "IR", postcode: "1234567890" });

        response.assertStatus(422);
    });

    test("malformed IR postcode is rejected with 422", async ({ client }) => {
        const tehranId = await regionId("IR-24");
        const seeded = await client.get("/api/v1/cart");
        const token = tokenFromResponse(seeded);

        const response = await client
            .post("/api/v1/cart/customer")
            .cookie("cart_token", token)
            .json({ country: "IR", region_id: tehranId, postcode: "123" });

        response.assertStatus(422);
    });
});
