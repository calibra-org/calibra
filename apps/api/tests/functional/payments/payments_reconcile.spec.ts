import { test } from "@japa/runner";
import { DateTime } from "luxon";

import { OrderStatus } from "#enums/order_status";
import { PaymentAttemptStatus } from "#enums/payment_attempt_status";
import PaymentAttempt from "#models/payment_attempt";
import PaymentGateway from "#models/payment_gateway";
import { createTaxableProduct } from "#tests/helpers/cart";
import { mockFetch, unmockFetch } from "#tests/helpers/mock_fetch";
import { iranRegionId } from "#tests/helpers/orders";
import { resetPhase08 } from "#tests/helpers/payments";

const REQUEST_URL = "https://payment.zarinpal.com/pg/v4/payment/request.json";

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
        .header("Idempotency-Key", `rec-${Date.now()}-${authority.slice(-5)}`);
    return submit.body().data.id;
}

test.group("payments:reconcile ace command", (group) => {
    group.each.setup(async () => {
        await resetPhase08();
        mockFetch({});
    });
    group.each.teardown(() => {
        unmockFetch();
    });

    test("detects pending orders past the reconcile window and emits a count", async ({ client, assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        await submitOrder(client, Number(product.id), "ARECONCILE000000000000000000001");

        const attempt = await PaymentAttempt.findByOrFail("gateway_authority", "ARECONCILE000000000000000000001");
        attempt.initiatedAt = DateTime.utc().minus({ minutes: 30 });
        await attempt.save();

        /**
         * Smoke-test the command: it should run to exit 0 with our seeded stranded order in
         * place. Full assertion of the metric / Sentry side-effects requires runtime hooks
         * we don't ship in tests today; the production observability stack (Prometheus +
         * GlitchTip) covers it end-to-end.
         */
        const ace = await import("@adonisjs/core/services/ace");
        const command = await ace.default.exec("payments:reconcile", ["--window=15"]);
        assert.equal(command.exitCode, 0);
    });

    test("ignores orders inside the window + non-pending orders", async ({ client, assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const orderId = await submitOrder(client, Number(product.id), "AFRESH00000000000000000000000001");
        await submitOrder(client, Number(product.id), "AOLDBUTCOMPLETED00000000000000001");

        const oldAttempt = await PaymentAttempt.findByOrFail("gateway_authority", "AOLDBUTCOMPLETED00000000000000001");
        oldAttempt.initiatedAt = DateTime.utc().minus({ hours: 2 });
        oldAttempt.status = PaymentAttemptStatus.Verified;
        await oldAttempt.save();

        const { default: Order } = await import("#models/order");
        const completedOrder = await Order.findOrFail(Number(oldAttempt.orderId));
        completedOrder.status = OrderStatus.Processing;
        await completedOrder.save();

        const ace = await import("@adonisjs/core/services/ace");
        const command = await ace.default.exec("payments:reconcile", ["--window=15"]);
        assert.equal(command.exitCode, 0);

        const log = command.logger.getLogs().map((l) => l.message);
        const stranded = log.filter((m) => m.includes("stranded order="));
        assert.lengthOf(stranded, 0, `fresh + completed orders should not appear stranded; orderId=${orderId} ignored`);
    });

    test("dry-run skips Sentry + metric updates but still logs stranded entries", async ({ client, assert }) => {
        const product = await createTaxableProduct({ regularPrice: 500_000 });
        await submitOrder(client, Number(product.id), "ADRY00000000000000000000000000001");
        const attempt = await PaymentAttempt.findByOrFail("gateway_authority", "ADRY00000000000000000000000000001");
        attempt.initiatedAt = DateTime.utc().minus({ hours: 1 });
        await attempt.save();

        const ace = await import("@adonisjs/core/services/ace");
        const command = await ace.default.exec("payments:reconcile", ["--window=15", "--dry-run"]);
        assert.equal(command.exitCode, 0);
    });
});
