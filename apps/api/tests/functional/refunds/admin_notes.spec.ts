import { test } from "@japa/runner";

import { OrderStatus } from "#enums/order_status";
import { UserFactory } from "#factories/user_factory";
import Customer from "#models/customer";
import OrderNote from "#models/order_note";
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

test.group("/api/v1/admin/orders/:order_id/notes", (group) => {
    group.each.setup(async () => {
        await resetWithPhase07();
    });

    test("admin creates internal + customer notes; list filters by type", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 1,
            price: 1_000_000,
        });
        await advanceOrderTo(order, OrderStatus.Processing);

        const internal = await client
            .post(`/api/v1/admin/orders/${order.id}/notes`)
            .loginAs(admin)
            .json({ body: "ops follow-up", visibility: "internal" });
        internal.assertStatus(201);
        assert.equal(internal.body().data.visibility, "internal");

        const customer = await client
            .post(`/api/v1/admin/orders/${order.id}/notes`)
            .loginAs(admin)
            .json({ body: "your refund is on the way", visibility: "customer", send_email: true });
        customer.assertStatus(201);
        assert.equal(customer.body().data.visibility, "customer");

        const customerOnly = await client.get(`/api/v1/admin/orders/${order.id}/notes`).qs({ type: "customer" }).loginAs(admin);
        customerOnly.assertStatus(200);
        const visible: Array<{ visibility: string }> = customerOnly.body().data;
        assert.isTrue(visible.every((n) => n.visibility === "customer"));
        assert.isTrue(visible.length >= 1);
    });

    test("DELETE removes the note", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 1,
            price: 1_000_000,
        });
        await advanceOrderTo(order, OrderStatus.Processing);

        const created = await client
            .post(`/api/v1/admin/orders/${order.id}/notes`)
            .loginAs(admin)
            .json({ body: "scratch", visibility: "internal" });
        const id = created.body().data.id;

        const del = await client.delete(`/api/v1/admin/orders/${order.id}/notes/${id}`).loginAs(admin);
        del.assertStatus(204);

        const remaining = await OrderNote.find(id);
        assert.isNull(remaining);
    });
});
