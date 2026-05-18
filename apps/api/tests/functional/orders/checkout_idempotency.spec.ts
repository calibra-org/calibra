import { test } from "@japa/runner";

import { OrderStatus } from "#enums/order_status";
import Order from "#models/order";
import PaymentGateway from "#models/payment_gateway";
import { createTaxableProduct } from "#tests/helpers/cart";
import { iranRegionId, resetPhase05 } from "#tests/helpers/orders";

function tokenFromResponse(response: { cookie(name: string): { value: unknown } | undefined }): string {
    const cookie = response.cookie("cart_token");
    if (!cookie || typeof cookie.value !== "string") throw new Error("expected cart_token");
    return cookie.value;
}

async function readyCart(client: any, productId: number) {
    const regionId = await iranRegionId();
    const gateway = await PaymentGateway.findByOrFail("code", "cod");
    const seeded = await client.post("/api/v1/cart/items").json({ product_id: productId, quantity: 1 });
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
                first_name: "Y",
                last_name: "Z",
                address_line_1: "Vali-Asr 1",
                city: "Tehran",
                country: "IR",
                region_id: regionId,
                postcode: "1234567890",
                phone: "+989121234567",
                email: "y@example.test",
            },
            payment_gateway_id: Number(gateway.id),
        });
    return token;
}

test.group("POST /api/v1/checkout/submit (idempotency)", (group) => {
    group.each.setup(async () => {
        await resetPhase05();
    });

    test("same Idempotency-Key returns the same order id", async ({ client, assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const token = await readyCart(client, Number(product.id));

        const a = await client.post("/api/v1/checkout/submit").cookie("cart_token", token).header("Idempotency-Key", "ik-1");
        a.assertStatus(200);

        const b = await client.post("/api/v1/checkout/submit").cookie("cart_token", token).header("Idempotency-Key", "ik-1");
        b.assertStatus(200);

        assert.equal(a.body().data.id, b.body().data.id);
        assert.equal(b.header("idempotency-replay"), "true");

        /**
         * cod is a no-redirect gateway; phase-08 `payment_service.init` transitions the order
         * to `on_hold` inline (no PSP callback ever arrives), so the assertion targets that
         * post-payment state — not the intermediate `pending` row the finalizer briefly writes.
         */
        const allOrders = await Order.query().where("status", OrderStatus.OnHold);
        assert.equal(allOrders.length, 1);
    });

    test("replay reflects the current order state", async ({ client, assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const token = await readyCart(client, Number(product.id));

        const first = await client.post("/api/v1/checkout/submit").cookie("cart_token", token).header("Idempotency-Key", "ik-2");
        const orderId = first.body().data.id;

        const order = await Order.findOrFail(orderId);
        /** cod already left this on_hold via the payment-service init path, so the replay must echo on_hold. */
        assert.equal(order.status, OrderStatus.OnHold);

        const replay = await client.post("/api/v1/checkout/submit").cookie("cart_token", token).header("Idempotency-Key", "ik-2");
        assert.equal(replay.body().data.status, "on_hold");
    });
});
