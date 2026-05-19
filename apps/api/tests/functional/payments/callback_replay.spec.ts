import { test } from "@japa/runner";

import { OrderStatus } from "#enums/order_status";
import { PaymentAttemptStatus } from "#enums/payment_attempt_status";
import Order from "#models/order";
import OrderStatusHistory from "#models/order_status_history";
import PaymentAttempt from "#models/payment_attempt";
import PaymentGateway from "#models/payment_gateway";
import { createTaxableProduct } from "#tests/helpers/cart";
import { mockFetch, unmockFetch } from "#tests/helpers/mock_fetch";
import { iranRegionId } from "#tests/helpers/orders";
import { resetPhase08 } from "#tests/helpers/payments";

const REQUEST_URL = "https://payment.zarinpal.com/pg/v4/payment/request.json";
const VERIFY_URL = "https://payment.zarinpal.com/pg/v4/payment/verify.json";

function tokenFromResponse(response: { cookie(name: string): { value: unknown } | undefined }): string {
    const cookie = response.cookie("cart_token");
    if (!cookie || typeof cookie.value !== "string") throw new Error("expected cart_token");
    return cookie.value;
}

async function submitOrder(client: any, productId: number, authority: string): Promise<number> {
    const regionId = await iranRegionId();
    const gateway = await PaymentGateway.findByOrFail("code", "zarinpal");
    mockFetch({ [REQUEST_URL]: { status: 200, body: { data: { code: 100, authority } } } });
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
    const submit = await client
        .post("/api/v1/checkout/submit")
        .cookie("cart_token", token)
        .header("Idempotency-Key", `rep-${Date.now()}`);
    return submit.body().data.id;
}

test.group("callback replay (idempotent)", (group) => {
    group.each.setup(async () => {
        await resetPhase08();
        mockFetch({});
    });
    group.each.teardown(() => {
        unmockFetch();
    });

    test("second identical callback is a no-op", async ({ client, assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const authority = "AREP00000000000000000000000000000001";
        const orderId = await submitOrder(client, Number(product.id), authority);

        mockFetch({
            [VERIFY_URL]: { status: 200, body: { data: { code: 100, ref_id: 800111223 } } },
        });

        const first = await client
            .get(`/api/v1/payment/callback/zarinpal`)
            .qs({ Authority: authority, Status: "OK" })
            .redirects(0);
        assert.equal(first.response.status, 302);

        const order = await Order.findOrFail(orderId);
        assert.equal(order.status, OrderStatus.Processing);

        const beforeCount = await countHistory(orderId);

        /** Re-fire the same callback — no extra verify HTTP call should be made. */
        const second = await client
            .get(`/api/v1/payment/callback/zarinpal`)
            .qs({ Authority: authority, Status: "OK" })
            .redirects(0);
        assert.equal(second.response.status, 302);
        const location = second.header("location") as string;
        assert.match(location, /checkout\/success/);

        const orderAfter = await Order.findOrFail(orderId);
        assert.equal(orderAfter.status, OrderStatus.Processing);
        assert.equal(orderAfter.transactionId, "800111223");

        const attempt = await PaymentAttempt.findByOrFail("gateway_authority", authority);
        assert.equal(attempt.status, PaymentAttemptStatus.Verified);

        const afterCount = await countHistory(orderId);
        assert.equal(afterCount, beforeCount);
    });
});

async function countHistory(orderId: number): Promise<number> {
    const rows = await OrderStatusHistory.query().where("order_id", orderId);
    return rows.length;
}
