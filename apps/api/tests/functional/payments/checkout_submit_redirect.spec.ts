import { test } from "@japa/runner";

import { OrderStatus } from "#enums/order_status";
import Order from "#models/order";
import PaymentAttempt from "#models/payment_attempt";
import PaymentGateway from "#models/payment_gateway";
import { createTaxableProduct } from "#tests/helpers/cart";
import { mockFetch, unmockFetch } from "#tests/helpers/mock_fetch";
import { iranRegionId } from "#tests/helpers/orders";
import { resetPhase08 } from "#tests/helpers/payments";

const REQUEST_URL = "https://payment.zarinpal.com/pg/v4/payment/request.json";

function tokenFromResponse(response: { cookie(name: string): { value: unknown } | undefined }): string {
    const cookie = response.cookie("cart_token");
    if (!cookie || typeof cookie.value !== "string") throw new Error("expected cart_token");
    return cookie.value;
}

async function prepareCart(client: any, productId: number, gatewayCode: string): Promise<string> {
    const regionId = await iranRegionId();
    const gateway = await PaymentGateway.findByOrFail("code", gatewayCode);
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
    return token;
}

test.group("POST /api/v1/checkout/submit — payment integration", (group) => {
    group.each.setup(async () => {
        await resetPhase08();
        mockFetch({});
    });
    group.each.teardown(() => {
        unmockFetch();
    });

    test("zarinpal submit returns adapter redirect_url and creates an attempt row", async ({ client, assert }) => {
        mockFetch({
            [REQUEST_URL]: {
                status: 200,
                body: { data: { code: 100, authority: "A00000000000000000000000000000000099" } },
            },
        });
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const token = await prepareCart(client, Number(product.id), "zarinpal");

        const submit = await client.post("/api/v1/checkout/submit").cookie("cart_token", token).header("Idempotency-Key", "zp-1");

        submit.assertStatus(200);
        submit.assertAgainstApiSpec();
        assert.equal(submit.body().data.status, "pending");
        assert.equal(
            submit.body().payment.redirect_url,
            "https://payment.zarinpal.com/pg/StartPay/A00000000000000000000000000000000099",
        );

        const attempt = await PaymentAttempt.query().orderBy("id", "desc").first();
        assert.isNotNull(attempt);
        assert.equal(attempt!.gatewayCodeSnapshot, "zarinpal");
        assert.equal(attempt!.gatewayAuthority, "A00000000000000000000000000000000099");
        assert.equal(attempt!.status, "awaiting_callback");
    });

    test("cod submit returns no redirect and lands the order in on_hold", async ({ client, assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const token = await prepareCart(client, Number(product.id), "cod");

        const submit = await client
            .post("/api/v1/checkout/submit")
            .cookie("cart_token", token)
            .header("Idempotency-Key", "cod-1");

        submit.assertStatus(200);
        submit.assertAgainstApiSpec();
        assert.isNull(submit.body().payment.redirect_url);

        const order = await Order.findOrFail(submit.body().data.id);
        assert.equal(order.status, OrderStatus.OnHold);
    });

    test("submit with disabled gateway returns 422 + no order transitions to processing", async ({ client, assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const zarinpal = await PaymentGateway.findByOrFail("code", "zarinpal");
        const token = await prepareCart(client, Number(product.id), "zarinpal");
        /** Disable after the draft snapshot — simulates "ops disabled mid-checkout". */
        zarinpal.enabled = false;
        await zarinpal.save();

        const submit = await client
            .post("/api/v1/checkout/submit")
            .cookie("cart_token", token)
            .header("Idempotency-Key", "zp-disabled-1");

        submit.assertStatus(422);

        const orders = await Order.query().where("status", OrderStatus.Processing);
        assert.lengthOf(orders, 0);
    });
});
