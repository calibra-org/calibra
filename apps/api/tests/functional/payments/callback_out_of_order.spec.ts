import { test } from "@japa/runner";
import { DateTime } from "luxon";

import { OrderStatus } from "#enums/order_status";
import { PaymentAttemptStatus } from "#enums/payment_attempt_status";
import PaymentAttempt from "#models/payment_attempt";
import PaymentGateway from "#models/payment_gateway";
import ProcessedWebhookEvent from "#models/processed_webhook_event";
import { createTaxableProduct } from "#tests/helpers/cart";
import { mockFetch, unmockFetch } from "#tests/helpers/mock_fetch";
import { iranRegionId } from "#tests/helpers/orders";
import { resetPhase08 } from "#tests/helpers/payments";

const REQUEST_URL = "https://payment.zarinpal.com/pg/v4/payment/request.json";
const VERIFY_URL = "https://payment.zarinpal.com/pg/v4/payment/verify.json";

interface CookieResp {
    cookie(name: string): { value: unknown } | undefined;
}
function tokenFromResponse(response: CookieResp): string {
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
        .header("Idempotency-Key", `oo-${Date.now()}`);
    return submit.body().data.id;
}

test.group("callback idempotency ledger + out-of-order", (group) => {
    group.each.setup(async () => {
        await resetPhase08();
        mockFetch({});
    });
    group.each.teardown(() => {
        unmockFetch();
    });

    test("replay writes ledger row exactly once + redirects to success URL", async ({ client, assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const authority = "ALEDGER00000000000000000000000001";
        await submitOrder(client, Number(product.id), authority);

        mockFetch({
            [VERIFY_URL]: { status: 200, body: { data: { code: 100, ref_id: 800111000 } } },
        });

        for (let i = 0; i < 3; i++) {
            const response = await client
                .get("/api/v1/payment/callback/zarinpal")
                .qs({ Authority: authority, Status: "OK" })
                .redirects(0);
            assert.equal(response.response.status, 302);
        }

        const ledger = await ProcessedWebhookEvent.query().where("provider", "zarinpal").where("event_id", authority);
        assert.equal(ledger.length, 1, "ledger must dedup by (provider, event_id)");
        assert.equal(ledger[0]?.outcome, "verified");
    });

    test("callback for an already-verified attempt that has no ledger row finalises as verified_out_of_order", async ({
        client,
        assert,
    }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const authority = "AOOO00000000000000000000000000001";
        await submitOrder(client, Number(product.id), authority);

        const attempt = await PaymentAttempt.findByOrFail("gateway_authority", authority);
        attempt.status = PaymentAttemptStatus.Verified;
        attempt.verifiedAt = DateTime.utc();
        attempt.gatewayTransactionId = "preverified-tx";
        await attempt.save();

        mockFetch({
            [VERIFY_URL]: { status: 200, body: { data: { code: 100, ref_id: 999999 } } },
        });

        const response = await client
            .get("/api/v1/payment/callback/zarinpal")
            .qs({ Authority: authority, Status: "OK" })
            .redirects(0);
        assert.equal(response.response.status, 302);
        const location = response.header("location") as string;
        assert.match(location, /checkout\/success/);

        const ledger = await ProcessedWebhookEvent.query().where("provider", "zarinpal").where("event_id", authority);
        assert.equal(ledger.length, 1);
        assert.equal(ledger[0]?.outcome, "verified_out_of_order");

        const attemptAfter = await PaymentAttempt.findByOrFail("gateway_authority", authority);
        assert.equal(attemptAfter.gatewayTransactionId, "preverified-tx", "must not re-verify");
    });

    test("failed status callback finalises ledger with 'failed' outcome", async ({ client, assert }) => {
        const product = await createTaxableProduct({ regularPrice: 500_000 });
        const authority = "AFAIL000000000000000000000000001";
        await submitOrder(client, Number(product.id), authority);

        const response = await client
            .get("/api/v1/payment/callback/zarinpal")
            .qs({ Authority: authority, Status: "NOK" })
            .redirects(0);
        assert.equal(response.response.status, 302);

        const order = await PaymentAttempt.findByOrFail("gateway_authority", authority);
        assert.equal(order.status, PaymentAttemptStatus.Failed);

        const ledger = await ProcessedWebhookEvent.query().where("provider", "zarinpal").where("event_id", authority);
        assert.equal(ledger.length, 1);
        assert.equal(ledger[0]?.outcome, "failed");
    });

    test("orders progress through Pending → Processing on success", async ({ client, assert }) => {
        const product = await createTaxableProduct({ regularPrice: 250_000 });
        const authority = "ASTATE0000000000000000000000000001";
        const orderId = await submitOrder(client, Number(product.id), authority);

        mockFetch({
            [VERIFY_URL]: { status: 200, body: { data: { code: 100, ref_id: 555 } } },
        });

        await client.get("/api/v1/payment/callback/zarinpal").qs({ Authority: authority, Status: "OK" }).redirects(0);

        const { default: Order } = await import("#models/order");
        const order = await Order.findOrFail(orderId);
        assert.equal(order.status, OrderStatus.Processing);
    });
});
