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

async function makeCustomerUser() {
    const user = await UserFactory.create();
    const customer = await Customer.create({
        userId: user.id,
        firstName: "C",
        lastName: "U",
        countryDefault: "IR",
        isPayingCustomer: false,
    });
    return { user, customer };
}

test.group("GET /api/v1/.../orders/:id/history", (group) => {
    group.each.setup(async () => {
        await resetWithPhase07();
    });

    test("admin endpoint returns the full audit row incl. actor + reason", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 1,
            price: 1_000_000,
        });
        await advanceOrderTo(order, OrderStatus.Completed);

        const response = await client.get(`/api/v1/admin/orders/${order.id}/history`).loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const rows: Array<{ to_status: string; reason: string | null; changed_by_user_id: number | null }> = response.body().data;
        assert.isAtLeast(rows.length, 3);
        assert.property(rows[0], "reason");
        assert.property(rows[0], "changed_by_user_id");
    });

    test("customer endpoint sanitizes the row (drops actor + reason, adds label_key)", async ({ client, assert }) => {
        const { user, customer } = await makeCustomerUser();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({
            customerId: Number(customer.id),
            productId: Number(product.id),
            quantity: 1,
            price: 1_000_000,
        });
        await advanceOrderTo(order, OrderStatus.Completed);

        const response = await client.get(`/api/v1/account/orders/${order.id}/history`).loginAs(user);
        response.assertStatus(200);
        const rows: Array<Record<string, unknown>> = response.body().data;
        assert.isAtLeast(rows.length, 3);
        for (const row of rows) {
            assert.notProperty(row, "changed_by_user_id");
            assert.notProperty(row, "reason");
            assert.property(row, "label_key");
        }
        const last = rows.at(-1)!;
        assert.equal(last.label_key, "order.status.completed");
    });

    test("customer cannot read another customer's history (404)", async ({ client }) => {
        const { user } = await makeCustomerUser();
        const { customer: other } = await makeCustomerUser();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({
            customerId: Number(other.id),
            productId: Number(product.id),
            quantity: 1,
            price: 1_000_000,
        });
        await advanceOrderTo(order, OrderStatus.Processing);

        const response = await client.get(`/api/v1/account/orders/${order.id}/history`).loginAs(user);
        response.assertStatus(404);
    });
});
