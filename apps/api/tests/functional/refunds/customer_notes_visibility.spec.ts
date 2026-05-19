import { test } from "@japa/runner";

import { OrderStatus } from "#enums/order_status";
import { UserFactory } from "#factories/user_factory";
import Customer from "#models/customer";
import OrderNote from "#models/order_note";
import { createTaxableProduct } from "#tests/helpers/cart";
import { makeDraftOrder } from "#tests/helpers/orders";
import { advanceOrderTo, resetWithPhase07 } from "#tests/helpers/refunds";

async function makeCustomer() {
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

test.group("GET /api/v1/account/orders/:id/notes (customer-side)", (group) => {
    group.each.setup(async () => {
        await resetWithPhase07();
    });

    test("only customer-visible notes are returned + internal fields stripped", async ({ client, assert }) => {
        const { user, customer } = await makeCustomer();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({
            customerId: Number(customer.id),
            productId: Number(product.id),
            quantity: 1,
            price: 1_000_000,
        });
        await advanceOrderTo(order, OrderStatus.Processing);

        await OrderNote.create({
            orderId: order.id,
            body: "internal-only note",
            visibility: "internal",
            authorUserId: null,
            attributes: {},
        });
        const visible = await OrderNote.create({
            orderId: order.id,
            body: "we shipped your order",
            visibility: "customer",
            authorUserId: null,
            attributes: {},
        });

        const response = await client.get(`/api/v1/account/orders/${order.id}/notes`).loginAs(user);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const rows: Array<{ id: number; body: string; visibility?: string; author_user_id?: number | null }> =
            response.body().data;
        assert.equal(rows.length, 1);
        assert.equal(rows[0].id, Number(visible.id));
        assert.notProperty(rows[0], "visibility");
        assert.notProperty(rows[0], "author_user_id");
    });

    test("cross-tenant order returns 404", async ({ client }) => {
        const { user } = await makeCustomer();
        const { customer: other } = await makeCustomer();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({
            customerId: Number(other.id),
            productId: Number(product.id),
            quantity: 1,
            price: 1_000_000,
        });
        await advanceOrderTo(order, OrderStatus.Processing);

        const response = await client.get(`/api/v1/account/orders/${order.id}/notes`).loginAs(user);
        response.assertStatus(404);
    });
});
