import { test } from "@japa/runner";

import { OrderStatus } from "#enums/order_status";
import { PaymentAttemptStatus } from "#enums/payment_attempt_status";
import Order from "#models/order";
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
        .header("Idempotency-Key", `amt-${Date.now()}`);
    submit.assertStatus(200);
    return submit.body().data.id;
}

test.group("callback amount-tamper guard", (group) => {
    group.each.setup(async () => {
        await resetPhase08();
        mockFetch({});
    });
    group.each.teardown(() => {
        unmockFetch();
    });

    test("PSP-reported amount differs → attempt failed + order failed + no processing", async ({ client, assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const authority = "AAMTMP0000000000000000000000000001";
        const orderId = await submitOrder(client, Number(product.id), authority);
        const order = await Order.findOrFail(orderId);
        const realAmount = Number(order.grandTotal);

        /** PSP reports a different (smaller) amount than what we sent — classic tampering signature. */
        mockFetch({
            [VERIFY_URL]: {
                status: 200,
                body: { data: { code: 100, ref_id: 999000111, amount: realAmount - 1 } },
            },
        });

        const callback = await client.get(`/api/v1/payment/callback/zarinpal`).qs({ Authority: authority, Status: "OK" }).redirects(0);
        assert.equal(callback.response.status, 302);
        const location = callback.header("location") as string;
        assert.match(location, /checkout\/failed/);

        const refreshed = await Order.findOrFail(orderId);
        assert.notEqual(refreshed.status, OrderStatus.Processing);

        const attempt = await PaymentAttempt.findByOrFail("gateway_authority", authority);
        assert.equal(attempt.status, PaymentAttemptStatus.Failed);
        assert.equal(attempt.errorCode, "amount_mismatch");
    });
});
