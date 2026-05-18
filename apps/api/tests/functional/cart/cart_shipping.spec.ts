import { test } from "@japa/runner";

import Region from "#models/region";
import { createTaxableProduct, resetWithFoundation } from "#tests/helpers/cart";

function tokenFromResponse(response: { cookie(name: string): { value: unknown } | undefined }): string {
    const cookie = response.cookie("cart_token");
    if (!cookie || typeof cookie.value !== "string") {
        throw new Error("expected cart_token cookie on response");
    }
    return cookie.value;
}

async function bootstrapCart(
    client: import("@japa/api-client").ApiClient,
): Promise<{ token: string; rates: number[]; productId: number }> {
    const product = await createTaxableProduct({ regularPrice: 5_000_000 });
    const tehran = await Region.findByOrFail("code", "IR-24");
    const seeded = await client.post("/api/v1/cart/items").json({ product_id: Number(product.id), quantity: 1 });
    const token = tokenFromResponse(seeded);
    const withAddress = await client
        .post("/api/v1/cart/customer")
        .cookie("cart_token", token)
        .json({ country: "IR", region_id: Number(tehran.id), postcode: "1234567890" });
    const rates: number[] = withAddress.body().data.shipping_rates.map((r: { id: number }) => r.id);
    return { token, rates, productId: Number(product.id) };
}

test.group("cart shipping", (group) => {
    group.each.setup(async () => {
        await resetWithFoundation();
    });

    test("populating an IR address surfaces the Iran zone's methods", async ({ client, assert }) => {
        const { rates } = await bootstrapCart(client);
        assert.isAbove(rates.length, 0);
    });

    test("selecting an ineligible rate is rejected with 422", async ({ client }) => {
        const { token } = await bootstrapCart(client);
        const response = await client
            .post("/api/v1/cart/shipping-rate")
            .cookie("cart_token", token)
            .json({ shipping_zone_method_id: 9999 });
        response.assertStatus(422);
    });

    test("selecting a valid rate marks it as selected and adds its cost to shipping_total", async ({ client, assert }) => {
        const { token, rates } = await bootstrapCart(client);
        const chosenRate = rates[0]!;

        const response = await client
            .post("/api/v1/cart/shipping-rate")
            .cookie("cart_token", token)
            .json({ shipping_zone_method_id: chosenRate });
        response.assertStatus(200);
        const body = response.body();
        const selected = body.data.shipping_rates.find((r: { id: number; selected: boolean }) => r.id === chosenRate);
        assert.isTrue(selected?.selected);
        assert.isAbove(body.data.totals.shipping_total, 0);
    });

    test("switching country clears the previously-selected shipping rate", async ({ client, assert }) => {
        const { token, rates } = await bootstrapCart(client);
        await client.post("/api/v1/cart/shipping-rate").cookie("cart_token", token).json({ shipping_zone_method_id: rates[0]! });

        const switched = await client.post("/api/v1/cart/customer").cookie("cart_token", token).json({ country: "US" });
        switched.assertStatus(200);
        const body = switched.body();
        assert.equal(body.data.totals.shipping_total, 0);
        assert.notExists(body.data.shipping_rates.find((r: { selected: boolean }) => r.selected));
    });
});
