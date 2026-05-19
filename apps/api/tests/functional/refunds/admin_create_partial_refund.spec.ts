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

test.group("POST /api/v1/admin/orders/:order_id/refunds (partial)", (group) => {
    group.each.setup(async () => {
        await resetWithPhase07();
    });

    test("line-item partial refund records correct quantity + amount", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 3,
            price: 1_000_000,
        });
        await advanceOrderTo(order, OrderStatus.Completed);
        const line = (await order.related("lineItems").query()).at(0)!;

        const response = await client
            .post(`/api/v1/admin/orders/${order.id}/refunds`)
            .loginAs(admin)
            .json({
                line_items: [{ order_line_item_id: Number(line.id), quantity: 1, refund_amount_minor: 1_000_000 }],
                reason: "customer changed mind",
            });
        response.assertStatus(201);
        response.assertAgainstApiSpec();
        const body = response.body();
        assert.equal(body.data.amount_minor, 1_000_000);
        assert.equal(body.data.line_items.length, 1);
        assert.equal(body.data.line_items[0].quantity, 1);

        await order.refresh();
        assert.equal(order.status, OrderStatus.Completed);
    });

    test("two partials sum to grand_total → transition to refunded", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 2,
            price: 1_000_000,
        });
        await advanceOrderTo(order, OrderStatus.Completed);
        const line = (await order.related("lineItems").query()).at(0)!;

        const first = await client
            .post(`/api/v1/admin/orders/${order.id}/refunds`)
            .loginAs(admin)
            .json({
                line_items: [{ order_line_item_id: Number(line.id), quantity: 1, refund_amount_minor: 1_000_000 }],
            });
        first.assertStatus(201);
        first.assertAgainstApiSpec();

        const second = await client
            .post(`/api/v1/admin/orders/${order.id}/refunds`)
            .loginAs(admin)
            .json({
                line_items: [{ order_line_item_id: Number(line.id), quantity: 1, refund_amount_minor: 1_000_000 }],
            });
        second.assertStatus(201);
        second.assertAgainstApiSpec();

        await order.refresh();
        assert.equal(order.status, OrderStatus.Refunded);
    });

    test("cross-order line_item → 422", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const orderA = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 2,
            price: 1_000_000,
        });
        const orderB = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 1,
            price: 1_000_000,
        });
        await advanceOrderTo(orderA, OrderStatus.Completed);
        await advanceOrderTo(orderB, OrderStatus.Completed);
        const lineFromB = (await orderB.related("lineItems").query()).at(0)!;

        const response = await client
            .post(`/api/v1/admin/orders/${orderA.id}/refunds`)
            .loginAs(admin)
            .json({
                line_items: [{ order_line_item_id: Number(lineFromB.id), quantity: 1, refund_amount_minor: 500_000 }],
            });
        response.assertStatus(422);
        assert.isTrue(JSON.stringify(response.body()).includes("does not belong"));
    });
});
