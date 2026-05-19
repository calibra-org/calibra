import { test } from "@japa/runner";
import { DateTime } from "luxon";

import { OrderStatus } from "#enums/order_status";
import { PaymentAttemptStatus } from "#enums/payment_attempt_status";
import Customer from "#models/customer";
import PaymentAttempt from "#models/payment_attempt";
import PaymentGateway from "#models/payment_gateway";
import User from "#models/user";
import { createTaxableProduct } from "#tests/helpers/cart";
import { makeDraftOrder } from "#tests/helpers/orders";
import { resetPhase08 } from "#tests/helpers/payments";

async function createAdmin(): Promise<User> {
    const user = await User.create({ email: "admin@calibra.dev", passwordHash: "Passw0rd1!", role: "admin", locale: "fa" });
    await Customer.create({ userId: user.id, firstName: "A", lastName: "U", countryDefault: "IR" });
    return user;
}

async function seedAttempt(opts: {
    gatewayCode: string;
    status: PaymentAttemptStatus;
    productId: number;
}): Promise<PaymentAttempt> {
    const gateway = await PaymentGateway.findByOrFail("code", opts.gatewayCode);
    const order = await makeDraftOrder({
        productId: opts.productId,
        quantity: 1,
        price: 1_000_000,
        gatewayId: Number(gateway.id),
    });
    const attempt = new PaymentAttempt();
    attempt.orderId = order.id;
    attempt.gatewayId = gateway.id;
    attempt.gatewayCodeSnapshot = gateway.code;
    attempt.amountMinor = 1_000_000;
    attempt.currency = "IRR";
    attempt.status = opts.status;
    attempt.gatewayPayload = { hello: "world" };
    attempt.initiatedAt = DateTime.utc();
    await attempt.save();
    /** Touch state machine isn't needed — these are pure DB seeds for the read-only endpoint. */
    void OrderStatus;
    return attempt;
}

test.group("/api/v1/admin/payment-attempts", (group) => {
    group.each.setup(async () => {
        await resetPhase08();
    });

    test("non-admin → 403", async ({ client }) => {
        const user = await User.create({ email: "nope@calibra.dev", passwordHash: "Passw0rd1!", role: "customer", locale: "fa" });
        await Customer.create({ userId: user.id, firstName: "C", lastName: "U", countryDefault: "IR" });
        const response = await client.get("/api/v1/admin/payment-attempts").withGuard("api").loginAs(user);
        response.assertStatus(403);
    });

    test("admin lists attempts paginated with filter by gateway_code", async ({ client, assert }) => {
        const admin = await createAdmin();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        await seedAttempt({ gatewayCode: "zarinpal", status: PaymentAttemptStatus.Initiated, productId: Number(product.id) });
        await seedAttempt({ gatewayCode: "zarinpal", status: PaymentAttemptStatus.Failed, productId: Number(product.id) });
        await seedAttempt({ gatewayCode: "cod", status: PaymentAttemptStatus.Verified, productId: Number(product.id) });

        const all = await client.get("/api/v1/admin/payment-attempts").withGuard("api").loginAs(admin);
        all.assertStatus(200);
        assert.equal(all.body().meta.total, 3);

        const filtered = await client
            .get("/api/v1/admin/payment-attempts")
            .qs({ gateway_code: "zarinpal" })
            .withGuard("api")
            .loginAs(admin);
        filtered.assertStatus(200);
        assert.equal(filtered.body().meta.total, 2);
        assert.deepEqual(
            (filtered.body().data as Array<{ gateway_code: string }>).map((r) => r.gateway_code),
            ["zarinpal", "zarinpal"],
        );
    });

    test("single attempt includes full gateway_payload", async ({ client, assert }) => {
        const admin = await createAdmin();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const attempt = await seedAttempt({
            gatewayCode: "zarinpal",
            status: PaymentAttemptStatus.Initiated,
            productId: Number(product.id),
        });

        const response = await client
            .get(`/api/v1/admin/payment-attempts/${Number(attempt.id)}`)
            .withGuard("api")
            .loginAs(admin);
        response.assertStatus(200);
        const body = response.body().data as { gateway_payload: Record<string, unknown> };
        assert.deepEqual(body.gateway_payload, { hello: "world" });
    });
});
