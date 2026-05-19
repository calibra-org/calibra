import { test } from "@japa/runner";

import PaymentAttempt from "#models/payment_attempt";
import PaymentGateway from "#models/payment_gateway";
import { zarinpalGateway } from "#services/adapters/zarinpal_gateway";
import { fetchCalls, mockFetch, unmockFetch } from "#tests/helpers/mock_fetch";
import { resetPhase08 } from "#tests/helpers/payments";

const REQUEST_URL = "https://payment.zarinpal.com/pg/v4/payment/request.json";
const VERIFY_URL = "https://payment.zarinpal.com/pg/v4/payment/verify.json";
const REFUND_URL = "https://payment.zarinpal.com/pg/v4/payment/refund.json";

async function makeAttempt(): Promise<PaymentAttempt> {
    const gateway = await PaymentGateway.findByOrFail("code", "zarinpal");
    /** Minimal attempt row — only the fields the adapter reads. */
    const attempt = new PaymentAttempt();
    attempt.orderId = 1 as unknown as number;
    attempt.gatewayId = gateway.id;
    attempt.gatewayCodeSnapshot = "zarinpal";
    attempt.amountMinor = 10_000_000;
    attempt.currency = "IRR";
    attempt.gatewayPayload = {};
    return attempt;
}

function fakeOrder() {
    return { id: 42, orderNumber: 1001, grandTotal: 10_000_000 } as never;
}

test.group("ZarinpalGateway (mocked HTTP)", (group) => {
    group.each.setup(async () => {
        await resetPhase08();
        mockFetch({});
    });
    group.each.teardown(() => {
        unmockFetch();
    });

    test("init posts to request.json and returns the StartPay redirect url", async ({ assert }) => {
        const attempt = await makeAttempt();
        mockFetch({
            [REQUEST_URL]: {
                status: 200,
                body: { data: { code: 100, authority: "A00000000000000000000000000000000001" } },
            },
        });

        const result = await zarinpalGateway.init({
            order: fakeOrder(),
            attempt,
            settings: { merchant_id: "TEST" },
            return_url: "http://localhost/api/v1/payment/callback/zarinpal",
        });

        assert.equal(result.authority, "A00000000000000000000000000000000001");
        assert.equal(result.redirect_url, "https://payment.zarinpal.com/pg/StartPay/A00000000000000000000000000000000001");
        const call = fetchCalls().find((c) => c.url === REQUEST_URL)!;
        assert.equal(call.method, "POST");
        const body = call.body as { merchant_id: string; amount: number; callback_url: string };
        assert.equal(body.merchant_id, "TEST");
        assert.equal(body.amount, 10_000_000);
        assert.equal(body.callback_url, "http://localhost/api/v1/payment/callback/zarinpal");
    });

    test("init failure returns redirect_url=null", async ({ assert }) => {
        const attempt = await makeAttempt();
        mockFetch({
            [REQUEST_URL]: { status: 200, body: { data: { code: -9 }, errors: { merchant_id: "invalid" } } },
        });
        const result = await zarinpalGateway.init({
            order: fakeOrder(),
            attempt,
            settings: { merchant_id: "BAD" },
            return_url: "http://localhost/cb",
        });
        assert.isNull(result.redirect_url);
    });

    test("init returns null redirect when merchant_id missing — no fetch is made", async ({ assert }) => {
        const attempt = await makeAttempt();
        const result = await zarinpalGateway.init({
            order: fakeOrder(),
            attempt,
            settings: {},
            return_url: "http://localhost/cb",
        });
        assert.isNull(result.redirect_url);
        assert.lengthOf(fetchCalls(), 0);
    });

    test("verify happy path returns transaction_id", async ({ assert }) => {
        const attempt = await makeAttempt();
        attempt.gatewayAuthority = "A0";
        mockFetch({
            [VERIFY_URL]: { status: 200, body: { data: { code: 100, ref_id: 99887766 } } },
        });
        const result = await zarinpalGateway.verify({
            attempt,
            callback: { authority: "A0", status: "success", payload: null },
            settings: { merchant_id: "TEST" },
        });
        assert.isTrue(result.ok);
        if (result.ok) assert.equal(result.transaction_id, "99887766");
    });

    test("verify returns ok=false on non-100 code", async ({ assert }) => {
        const attempt = await makeAttempt();
        attempt.gatewayAuthority = "A0";
        mockFetch({
            [VERIFY_URL]: { status: 200, body: { data: { code: -53, message: "expired" } } },
        });
        const result = await zarinpalGateway.verify({
            attempt,
            callback: { authority: "A0", status: "success", payload: null },
            settings: { merchant_id: "TEST" },
        });
        assert.isFalse(result.ok);
        if (!result.ok) assert.match(result.error_code, /verify_code/);
    });

    test("refund posts to refund.json and returns refund id", async ({ assert }) => {
        const attempt = await makeAttempt();
        attempt.gatewayAuthority = "A0";
        mockFetch({
            [REFUND_URL]: { status: 200, body: { data: { code: 100, refund_id: 555 } } },
        });
        const result = await zarinpalGateway.refund({
            attempt,
            amount_minor: 5_000_000,
            reason: "test",
            settings: { merchant_id: "TEST", refunds_enabled: true },
        });
        assert.isTrue(result.ok);
        if (result.ok) assert.equal(result.gateway_refund_id, "555");
    });

    test("refund respects per-merchant refunds_enabled=false", async ({ assert }) => {
        const attempt = await makeAttempt();
        const result = await zarinpalGateway.refund({
            attempt,
            amount_minor: 1_000_000,
            settings: { merchant_id: "TEST", refunds_enabled: false },
        });
        assert.isFalse(result.ok);
        if (!result.ok) assert.equal(result.error_code, "refunds_disabled");
        assert.lengthOf(fetchCalls(), 0);
    });
});
