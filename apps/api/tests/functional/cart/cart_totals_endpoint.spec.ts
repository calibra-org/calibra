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

test.group("GET /api/v1/cart end-to-end totals", (group) => {
    group.each.setup(async () => {
        await resetWithFoundation();
    });

    test("add items + IR address + tipax rate produces consistent grand_total", async ({ client, assert }) => {
        const a = await createTaxableProduct({ regularPrice: 2_200_000 });
        const b = await createTaxableProduct({ regularPrice: 3_300_000 });
        const tehran = await Region.findByOrFail("code", "IR-24");

        const seeded = await client.post("/api/v1/cart/items").json({ product_id: Number(a.id), quantity: 2 });
        const token = tokenFromResponse(seeded);
        await client
            .post("/api/v1/cart/items")
            .cookie("cart_token", token)
            .json({ product_id: Number(b.id), quantity: 1 });
        await client
            .post("/api/v1/cart/customer")
            .cookie("cart_token", token)
            .json({ country: "IR", region_id: Number(tehran.id), postcode: "1234567890" });

        const ratesResponse = await client.get("/api/v1/cart").cookie("cart_token", token);
        const tipaxRate = ratesResponse
            .body()
            .data.shipping_rates.find((r: { method_code: string }) => r.method_code === "tipax");
        assert.exists(tipaxRate, "tipax rate missing from foundation seed");

        const finalized = await client
            .post("/api/v1/cart/shipping-rate")
            .cookie("cart_token", token)
            .json({ shipping_zone_method_id: tipaxRate.id });
        finalized.assertStatus(200);
        finalized.assertAgainstApiSpec();

        const body = finalized.body();
        const totals = body.data.totals;

        /** items: 2 × 2,200,000 + 1 × 3,300,000 = 7,700,000 gross. 10% inc tax → base 7,000,000, tax 700,000. */
        assert.equal(totals.items_total, 7_000_000);
        assert.equal(totals.items_tax_total, 700_000);
        /** shipping_total + items_total + tax_total = grand_total (post-discount). */
        assert.equal(
            totals.grand_total,
            totals.items_total + totals.shipping_total + totals.tax_total - totals.discount_total - totals.discount_tax_total,
        );
        assert.equal(totals.shipping_total, 800_000);
        assert.equal(totals.grand_total, 8_500_000);
    });
});
