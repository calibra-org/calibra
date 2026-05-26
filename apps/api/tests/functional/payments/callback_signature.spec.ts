import { createHmac } from "node:crypto";
import { test } from "@japa/runner";

import PaymentGateway from "#models/payment_gateway";
import env from "#start/env";
import { resetPhase08 } from "#tests/helpers/payments";

const SECRET_ENV_KEY = "PAYMENT_WEBHOOK_SECRET_ZARINPAL";
const SECRET_VALUE = "phase1-test-hmac-secret";
const SIG_HEADER = "x-zarinpal-signature";

async function enableSignedCallback(): Promise<void> {
    const gateway = await PaymentGateway.findByOrFail("code", "zarinpal");
    gateway.signedCallback = true;
    gateway.webhookSecretEnvKey = SECRET_ENV_KEY;
    gateway.webhookSignatureHeader = SIG_HEADER;
    await gateway.save();
    env.set(SECRET_ENV_KEY as never, SECRET_VALUE);
}

test.group("gateway-aware webhook signature middleware", (group) => {
    group.each.setup(async () => {
        await resetPhase08();
    });

    test("unsigned gateway (default posture) lets the callback flow proceed", async ({ client }) => {
        const response = await client
            .get("/api/v1/payment/callback/zarinpal")
            .qs({ Authority: "AUNSIGNED0000000000000000000000001", Status: "OK" })
            .redirects(0);

        /**
         * The callback continues past the signature middleware. The attempt doesn't exist so
         * the payment service throws E_PAYMENT_ATTEMPT_NOT_FOUND (404). What matters here is
         * that the response is NOT a signature-rejected 401 — the middleware no-opped.
         */
        response.assertStatus(404);
        response.assertBodyContains({ errors: [{ code: "E_PAYMENT_ATTEMPT_NOT_FOUND" }] });
    });

    test("signed gateway with no signature header returns 401", async ({ client, assert }) => {
        await enableSignedCallback();

        const response = await client
            .get("/api/v1/payment/callback/zarinpal")
            .qs({ Authority: "AMISSING000000000000000000000001", Status: "OK" })
            .redirects(0);

        response.assertStatus(401);
        const body = response.body() as { errors: Array<{ code: string }> };
        assert.equal(body.errors[0]?.code, "E_UNSIGNED");
    });

    test("signed gateway with bad signature returns 401", async ({ client, assert }) => {
        await enableSignedCallback();

        const response = await client
            .get("/api/v1/payment/callback/zarinpal")
            .qs({ Authority: "ABADSIG0000000000000000000000001", Status: "OK" })
            .header(SIG_HEADER, "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef")
            .redirects(0);

        response.assertStatus(401);
        const body = response.body() as { errors: Array<{ code: string }> };
        assert.equal(body.errors[0]?.code, "E_BAD_SIGNATURE");
    });

    test("signed gateway with missing env secret returns config-error 401 (fail-loud, never fail-open)", async ({
        client,
        assert,
    }) => {
        const gateway = await PaymentGateway.findByOrFail("code", "zarinpal");
        gateway.signedCallback = true;
        gateway.webhookSecretEnvKey = "PAYMENT_WEBHOOK_SECRET_ZARINPAL";
        gateway.webhookSignatureHeader = null;
        await gateway.save();

        const response = await client
            .get("/api/v1/payment/callback/zarinpal")
            .qs({ Authority: "ANOCONF0000000000000000000000001", Status: "OK" })
            .redirects(0);

        response.assertStatus(401);
        const body = response.body() as { errors: Array<{ code: string }> };
        assert.equal(body.errors[0]?.code, "E_SIGNATURE_CONFIG_MISSING");
    });

    test("signed gateway with correct HMAC passes the middleware (proceeds to attempt lookup)", async ({ client }) => {
        await enableSignedCallback();
        const authority = "AGOODSIG000000000000000000000001";
        const query = `Authority=${authority}&Status=OK`;
        const signature = createHmac("sha256", SECRET_VALUE).update("").digest("hex");

        const response = await client
            .get(`/api/v1/payment/callback/zarinpal?${query}`)
            .header(SIG_HEADER, signature)
            .redirects(0);

        /**
         * The middleware passes — the request reaches the payment service, which then 404s on
         * the missing attempt. A 401 here would mean the middleware blocked us.
         */
        response.assertStatus(404);
        response.assertBodyContains({ errors: [{ code: "E_PAYMENT_ATTEMPT_NOT_FOUND" }] });
    });
});
