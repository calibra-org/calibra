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

test.group("POST /api/v1/admin/orders/:order_id/refunds (full)", (group) => {
    group.each.setup(async () => {
        await resetWithPhase07();
    });

    test("happy path: full refund transitions to refunded + returns 201", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 1,
            price: 1_000_000,
        });
        await advanceOrderTo(order, OrderStatus.Completed);

        const response = await client
            .post(`/api/v1/admin/orders/${order.id}/refunds`)
            .loginAs(admin)
            .json({ amount_minor: Number(order.grandTotal), reason: "goodwill" });

        response.assertStatus(201);
        const body = response.body();
        assert.equal(body.data.amount_minor, Number(order.grandTotal));
        assert.equal(body.data.reason, "goodwill");
        assert.isNumber(body.data.refund_number);

        await order.refresh();
        assert.equal(order.status, OrderStatus.Refunded);
    });

    test("non-admin caller → 403", async ({ client }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 1,
            price: 1_000_000,
        });
        await advanceOrderTo(order, OrderStatus.Completed);

        const customer = await UserFactory.create();
        await Customer.create({
            userId: customer.id,
            firstName: "X",
            lastName: "Y",
            countryDefault: "IR",
            isPayingCustomer: false,
        });

        const response = await client
            .post(`/api/v1/admin/orders/${order.id}/refunds`)
            .loginAs(customer)
            .json({ amount_minor: 1_000_000 });
        response.assertStatus(403);
    });

    test("already-refunded order returns 409", async ({ client }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 1,
            price: 1_000_000,
        });
        await advanceOrderTo(order, OrderStatus.Completed);

        await client
            .post(`/api/v1/admin/orders/${order.id}/refunds`)
            .loginAs(admin)
            .json({ amount_minor: Number(order.grandTotal) });

        const replay = await client.post(`/api/v1/admin/orders/${order.id}/refunds`).loginAs(admin).json({ amount_minor: 1_000 });
        replay.assertStatus(409);
    });

    test("DELETE returns 405 (refunds immutable)", async ({ client }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 1,
            price: 1_000_000,
        });
        await advanceOrderTo(order, OrderStatus.Completed);

        const created = await client
            .post(`/api/v1/admin/orders/${order.id}/refunds`)
            .loginAs(admin)
            .json({ amount_minor: 500_000 });
        const refundId = created.body().data.id;

        const del = await client.delete(`/api/v1/admin/orders/${order.id}/refunds/${refundId}`).loginAs(admin);
        del.assertStatus(405);
    });
});
