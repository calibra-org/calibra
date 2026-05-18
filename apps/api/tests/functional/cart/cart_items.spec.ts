import { test } from "@japa/runner";

import InventoryItem from "#models/inventory_item";
import { createTaxableProduct, createVariation, resetWithFoundation } from "#tests/helpers/cart";

function tokenFromResponse(response: { cookie(name: string): { value: unknown } | undefined }): string {
    const cookie = response.cookie("cart_token");
    if (!cookie || typeof cookie.value !== "string") {
        throw new Error("expected cart_token cookie on response");
    }
    return cookie.value;
}

test.group("POST /api/v1/cart/items", (group) => {
    group.each.setup(async () => {
        await resetWithFoundation();
    });

    test("adds a new line and returns the cart envelope", async ({ client, assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const response = await client.post("/api/v1/cart/items").json({ product_id: Number(product.id), quantity: 1 });
        response.assertStatus(200);
        const body = response.body();
        assert.equal(body.data.items.length, 1);
        assert.equal(body.data.items[0].product_id, Number(product.id));
        assert.equal(body.data.items[0].quantity, 1);
        assert.equal(body.data.items[0].price, 1_000_000);
    });

    test("adding same SKU twice increments quantity (no duplicate row)", async ({ client, assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });

        const first = await client.post("/api/v1/cart/items").json({ product_id: Number(product.id), quantity: 1 });
        first.assertStatus(200);
        const token = tokenFromResponse(first);

        const second = await client
            .post("/api/v1/cart/items")
            .cookie("cart_token", token)
            .json({ product_id: Number(product.id), quantity: 2 });

        second.assertStatus(200);
        const body = second.body();
        assert.equal(body.data.items.length, 1);
        assert.equal(body.data.items[0].quantity, 3);
    });

    test("PATCH quantity=0 removes the line", async ({ client, assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const added = await client.post("/api/v1/cart/items").json({ product_id: Number(product.id), quantity: 2 });
        const token = tokenFromResponse(added);
        const lineId = added.body().data.items[0].id;

        const patched = await client.patch(`/api/v1/cart/items/${lineId}`).cookie("cart_token", token).json({ quantity: 0 });
        patched.assertStatus(200);
        assert.equal(patched.body().data.items.length, 0);
    });

    test("DELETE removes a single line", async ({ client, assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const added = await client.post("/api/v1/cart/items").json({ product_id: Number(product.id), quantity: 2 });
        const token = tokenFromResponse(added);
        const lineId = added.body().data.items[0].id;

        const deleted = await client.delete(`/api/v1/cart/items/${lineId}`).cookie("cart_token", token);
        deleted.assertStatus(200);
        assert.equal(deleted.body().data.items.length, 0);
    });

    test("DELETE /items clears the entire cart", async ({ client, assert }) => {
        const a = await createTaxableProduct({ regularPrice: 1_000_000 });
        const b = await createTaxableProduct({ regularPrice: 2_000_000 });
        const seeded = await client.post("/api/v1/cart/items").json({ product_id: Number(a.id), quantity: 1 });
        const token = tokenFromResponse(seeded);
        await client
            .post("/api/v1/cart/items")
            .cookie("cart_token", token)
            .json({ product_id: Number(b.id), quantity: 1 });

        const cleared = await client.delete("/api/v1/cart/items").cookie("cart_token", token);
        cleared.assertStatus(200);
        assert.equal(cleared.body().data.items.length, 0);
    });

    test("variable product without variation_id is rejected with 422", async ({ client }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000, type: "variable" });
        const response = await client.post("/api/v1/cart/items").json({ product_id: Number(product.id), quantity: 1 });
        response.assertStatus(422);
    });

    test("a variation that doesn't belong to the product is rejected", async ({ client }) => {
        const parent = await createTaxableProduct({ regularPrice: 1_000_000, type: "variable" });
        const stranger = await createTaxableProduct({ regularPrice: 1_500_000, type: "variable" });
        const variation = await createVariation(stranger, 1_500_000);
        const response = await client
            .post("/api/v1/cart/items")
            .json({ product_id: Number(parent.id), variation_id: Number(variation.id), quantity: 1 });
        response.assertStatus(422);
    });

    test("sold_individually=true caps quantity at 1", async ({ client, assert }) => {
        const product = await createTaxableProduct({ regularPrice: 5_000_000, soldIndividually: true });
        const response = await client.post("/api/v1/cart/items").json({ product_id: Number(product.id), quantity: 4 });
        response.assertStatus(200);
        assert.equal(response.body().data.items[0].quantity, 1);

        const token = tokenFromResponse(response);
        const again = await client
            .post("/api/v1/cart/items")
            .cookie("cart_token", token)
            .json({ product_id: Number(product.id), quantity: 3 });
        again.assertStatus(200);
        assert.equal(again.body().data.items[0].quantity, 1);
    });

    test("out-of-stock products return 422", async ({ client }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        await InventoryItem.query().where("product_id", Number(product.id)).update({ stock_status: "outofstock" });
        const response = await client.post("/api/v1/cart/items").json({ product_id: Number(product.id), quantity: 1 });
        response.assertStatus(422);
    });
});
