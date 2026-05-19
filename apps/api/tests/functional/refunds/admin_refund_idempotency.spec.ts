import { test } from "@japa/runner";

import { OrderStatus } from "#enums/order_status";
import { UserFactory } from "#factories/user_factory";
import Customer from "#models/customer";
import OrderRefund from "#models/order_refund";
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

test.group("POST /api/v1/admin/orders/:order_id/refunds (idempotency)", (group) => {
    group.each.setup(async () => {
        await resetWithPhase07();
    });

    test("same Idempotency-Key returns the same refund + no duplicate row", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 3,
            price: 1_000_000,
        });
        await advanceOrderTo(order, OrderStatus.Processing);

        const first = await client
            .post(`/api/v1/admin/orders/${order.id}/refunds`)
            .loginAs(admin)
            .header("Idempotency-Key", "rfd-1")
            .json({ amount_minor: 1_000_000, restock_requested: false });
        first.assertStatus(201);
        first.assertAgainstApiSpec();
        const firstId = first.body().data.id;

        const second = await client
            .post(`/api/v1/admin/orders/${order.id}/refunds`)
            .loginAs(admin)
            .header("Idempotency-Key", "rfd-1")
            .json({ amount_minor: 1_000_000, restock_requested: false });
        second.assertStatus(201);
        second.assertAgainstApiSpec();
        assert.equal(second.body().data.id, firstId);

        const all = await OrderRefund.query().where("order_id", Number(order.id));
        assert.equal(all.length, 1);
    });
});
