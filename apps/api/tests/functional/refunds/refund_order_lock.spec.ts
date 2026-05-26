import lock from "@adonisjs/lock/services/main";
import { test } from "@japa/runner";

import { OrderStatus } from "#enums/order_status";
import { UserFactory } from "#factories/user_factory";
import Customer from "#models/customer";
import { createTaxableProduct } from "#tests/helpers/cart";
import { makeDraftOrder } from "#tests/helpers/orders";
import { advanceOrderTo, resetWithPhase07 } from "#tests/helpers/refunds";

async function adminUser() {
    const admin = await UserFactory.apply("admin").create();
    await Customer.create({
        userId: admin.id,
        firstName: "Admin",
        lastName: "User",
        countryDefault: "IR",
        isPayingCustomer: false,
    });
    return admin;
}

test.group("POST /api/v1/admin/orders/:order_id/refunds (order-scoped lock)", (group) => {
    group.each.setup(async () => {
        await resetWithPhase07();
    });

    test("returns 409 when another caller holds the order:<id> lock", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 1,
            price: 1_000_000,
        });
        await advanceOrderTo(order, OrderStatus.Processing);

        /**
         * Hold the lock outside the request so the refund controller can't acquire it. The
         * service should fail fast with `acquired=false` and surface as a 409.
         */
        const heldLock = lock.createLock(`order:${Number(order.id)}`, "30s");
        const acquired = await heldLock.acquire();
        assert.isTrue(acquired);

        try {
            const response = await client
                .post(`/api/v1/admin/orders/${order.id}/refunds`)
                .loginAs(admin)
                .header("Idempotency-Key", "lock-1")
                .json({ amount_minor: 1_000_000, restock_requested: false });

            response.assertStatus(409);
            const body = response.body() as { errors: Array<{ code: string }> };
            assert.equal(body.errors[0]?.code, "E_CONCURRENT_PROCESSING");
        } finally {
            await heldLock.release();
        }
    });

    test("refund succeeds once the lock is released", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 1,
            price: 1_000_000,
        });
        await advanceOrderTo(order, OrderStatus.Processing);

        const heldLock = lock.createLock(`order:${Number(order.id)}`, "30s");
        await heldLock.acquire();
        await heldLock.release();

        const response = await client
            .post(`/api/v1/admin/orders/${order.id}/refunds`)
            .loginAs(admin)
            .header("Idempotency-Key", "lock-2")
            .json({ amount_minor: 1_000_000, restock_requested: false });
        response.assertStatus(201);
        response.assertAgainstApiSpec();
        assert.equal(response.body().data.amount_minor, "1000000");
    });
});
