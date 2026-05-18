import { test } from "@japa/runner";

import { OrderStatus } from "#enums/order_status";
import InventoryItem from "#models/inventory_item";
import Order from "#models/order";
import PaymentGateway from "#models/payment_gateway";
import { createTaxableProduct } from "#tests/helpers/cart";
import { iranRegionId, resetPhase05 } from "#tests/helpers/orders";

function tokenFromResponse(response: { cookie(name: string): { value: unknown } | undefined }): string {
    const cookie = response.cookie("cart_token");
    if (!cookie || typeof cookie.value !== "string") throw new Error("expected cart_token");
    return cookie.value;
}

async function prepareReadyCart(client: any, product: { id: bigint | number }, quantity = 1): Promise<string> {
    const regionId = await iranRegionId();
    const gateway = await PaymentGateway.findByOrFail("code", "cod");
    const seeded = await client.post("/api/v1/cart/items").json({ product_id: Number(product.id), quantity });
    const token = tokenFromResponse(seeded);
    await client
        .post("/api/v1/cart/customer")
        .cookie("cart_token", token)
        .json({ country: "IR", region_id: regionId, postcode: "1234567890" });
    await client
        .put("/api/v1/checkout")
        .cookie("cart_token", token)
        .json({
            billing_address: {
                first_name: "S",
                last_name: "T",
                address_line_1: "Vali-Asr 1",
                city: "Tehran",
                country: "IR",
                region_id: regionId,
                postcode: "1234567890",
                phone: "+989121234567",
                email: "t@example.test",
            },
            payment_gateway_id: Number(gateway.id),
        });
    return token;
}

test.group("POST /api/v1/checkout/submit (happy + sad paths)", (group) => {
    group.each.setup(async () => {
        await resetPhase05();
    });

    test("happy path: draft → pending, stock reserved, cart cleared", async ({ client, assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const before = await InventoryItem.query().where("product_id", Number(product.id)).first();
        const token = await prepareReadyCart(client, product, 2);

        const submit = await client
            .post("/api/v1/checkout/submit")
            .cookie("cart_token", token)
            .header("Idempotency-Key", "smoke-1");

        submit.assertStatus(200);
        const body = submit.body();
        assert.equal(body.data.status, "pending");
        assert.exists(body.data.order_key);
        assert.equal(body.payment.method_code, "cod");

        const after = await InventoryItem.query().where("product_id", Number(product.id)).first();
        assert.equal(after!.stockQuantity, before!.stockQuantity - 2);

        const ordersForCart = await Order.query().where("status", OrderStatus.Pending).where("idempotency_key", "smoke-1");
        assert.equal(ordersForCart.length, 1);

        const refreshedCart = await client.get("/api/v1/cart").cookie("cart_token", token);
        assert.equal(refreshedCart.body().data.items.length, 0);
    });

    test("missing draft → 422", async ({ client }) => {
        const response = await client.post("/api/v1/checkout/submit");
        response.assertStatus(422);
    });

    test("empty draft submit returns 422", async ({ client }) => {
        /** No add-to-cart step before submit. */
        const response = await client.post("/api/v1/checkout/submit");
        response.assertStatus(422);
    });
});
