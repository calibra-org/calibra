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

async function submitZarinpalOrder(client: any, productId: number): Promise<{ orderId: number; authority: string }> {
    const regionId = await iranRegionId();
    const gateway = await PaymentGateway.findByOrFail("code", "zarinpal");
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
        .header("Idempotency-Key", `cb-${Date.now()}`);
    submit.assertStatus(200);
    submit.assertAgainstApiSpec();
    const attempt = await PaymentAttempt.query().orderBy("id", "desc").firstOrFail();
    return { orderId: submit.body().data.id, authority: attempt.gatewayAuthority! };
}

test.group("GET /api/v1/payment/callback/zarinpal — happy path", (group) => {
    group.each.setup(async () => {
        await resetPhase08();
        mockFetch({});
    });
    group.each.teardown(() => {
        unmockFetch();
    });

    test("successful callback transitions order to processing + writes audit row", async ({ client, assert }) => {
        mockFetch({
            [REQUEST_URL]: { status: 200, body: { data: { code: 100, authority: "AOK00000000000000000000000000000001" } } },
        });
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const { orderId, authority } = await submitZarinpalOrder(client, Number(product.id));

        mockFetch({
            [VERIFY_URL]: { status: 200, body: { data: { code: 100, ref_id: 700111222 } } },
        });

        const callback = await client
            .get(`/api/v1/payment/callback/zarinpal`)
            .qs({ Authority: authority, Status: "OK" })
            .redirects(0);
        assert.equal(callback.response.status, 302);
        const location = callback.header("location") as string;
        assert.match(location, /checkout\/success/);
        assert.match(location, /order_key=/);

        const order = await Order.findOrFail(orderId);
        assert.equal(order.status, OrderStatus.Processing);
        assert.equal(order.transactionId, "700111222");

        const attempt = await PaymentAttempt.findByOrFail("gateway_authority", authority);
        assert.equal(attempt.status, PaymentAttemptStatus.Verified);
        assert.equal(attempt.gatewayTransactionId, "700111222");
        assert.isNotNull(attempt.verifiedAt);

        const history = await OrderStatusHistory.query()
            .where("order_id", orderId)
            .where("to_status", OrderStatus.Processing)
            .first();
        assert.isNotNull(history);
        assert.equal(history!.reason, "payment_verified");
    });
});
