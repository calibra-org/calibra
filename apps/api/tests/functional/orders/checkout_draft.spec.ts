import { test } from "@japa/runner";

import OrderAddress from "#models/order_address";
import PaymentGateway from "#models/payment_gateway";
import { createTaxableProduct } from "#tests/helpers/cart";
import { iranRegionId, resetPhase05 } from "#tests/helpers/orders";

function tokenFromResponse(response: { cookie(name: string): { value: unknown } | undefined }): string {
    const cookie = response.cookie("cart_token");
    if (!cookie || typeof cookie.value !== "string") {
        throw new Error("expected cart_token cookie on response");
    }
    return cookie.value;
}

async function codGatewayId(): Promise<number> {
    const gateway = await PaymentGateway.findByOrFail("code", "cod");
    return Number(gateway.id);
}

test.group("GET /api/v1/checkout (draft materialization)", (group) => {
    group.each.setup(async () => {
        await resetPhase05();
    });

    test("creates a draft order from the current cart", async ({ client, assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const regionId = await iranRegionId();
        const seeded = await client.post("/api/v1/cart/items").json({ product_id: Number(product.id), quantity: 2 });
        const token = tokenFromResponse(seeded);
        await client
            .post("/api/v1/cart/customer")
            .cookie("cart_token", token)
            .json({ country: "IR", region_id: regionId, postcode: "1234567890" });

        const response = await client.get("/api/v1/checkout").cookie("cart_token", token);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body();
        assert.equal(body.data.status, "draft");
        assert.equal(body.data.line_items.length, 1);
        assert.equal(body.data.line_items[0].product_id, Number(product.id));
        assert.equal(body.data.line_items[0].quantity, 2);
    });

    test("GET twice returns the same draft id", async ({ client, assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const regionId = await iranRegionId();
        const seeded = await client.post("/api/v1/cart/items").json({ product_id: Number(product.id), quantity: 1 });
        const token = tokenFromResponse(seeded);
        await client
            .post("/api/v1/cart/customer")
            .cookie("cart_token", token)
            .json({ country: "IR", region_id: regionId, postcode: "1234567890" });

        const first = await client.get("/api/v1/checkout").cookie("cart_token", token);
        const second = await client.get("/api/v1/checkout").cookie("cart_token", token);
        assert.equal(first.body().data.id, second.body().data.id);
    });

    test("PUT persists billing + shipping addresses + payment", async ({ client, assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const regionId = await iranRegionId();
        const gatewayId = await codGatewayId();
        const seeded = await client.post("/api/v1/cart/items").json({ product_id: Number(product.id), quantity: 1 });
        const token = tokenFromResponse(seeded);
        await client
            .post("/api/v1/cart/customer")
            .cookie("cart_token", token)
            .json({ country: "IR", region_id: regionId, postcode: "1234567890" });

        const put = await client
            .put("/api/v1/checkout")
            .cookie("cart_token", token)
            .json({
                billing_address: {
                    first_name: "Ali",
                    last_name: "Reza",
                    address_line_1: "Vali-Asr 1",
                    city: "Tehran",
                    country: "IR",
                    region_id: regionId,
                    postcode: "1234567890",
                    phone: "+989121234567",
                    email: "ali@example.test",
                },
                payment_gateway_id: gatewayId,
                customer_note: "leave at the door",
            });
        put.assertStatus(200);
        put.assertAgainstApiSpec();
        const body = put.body();
        assert.equal(body.data.billing_address.first_name, "Ali");
        assert.equal(body.data.payment.gateway_id, gatewayId);
        assert.equal(body.data.customer_note, "leave at the door");

        const billings = await OrderAddress.query().where("order_id", body.data.id).where("kind", "billing");
        assert.equal(billings.length, 1);
    });
});
