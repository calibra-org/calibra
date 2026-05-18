import { test } from "@japa/runner";

import { OrderStatus } from "#enums/order_status";
import { UserFactory } from "#factories/user_factory";
import Customer from "#models/customer";
import OrderStatusHistory from "#models/order_status_history";
import { createTaxableProduct } from "#tests/helpers/cart";
import { makeDraftOrder, resetPhase05 } from "#tests/helpers/orders";

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

test.group("POST /api/v1/admin/orders/:id/status (transition matrix)", (group) => {
    group.each.setup(async () => {
        await resetPhase05();
    });

    test("each legal transition succeeds + writes history; illegal returns 422", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });

        const draft = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 1,
            price: 1_000_000,
        });

        /** draft → pending (legal). */
        const a = await client
            .post(`/api/v1/admin/orders/${draft.id}/status`)
            .loginAs(admin)
            .json({ to_status: "pending", reason: "manual" });
        a.assertStatus(200);
        assert.equal(a.body().data.status, "pending");

        /** pending → completed (illegal — must go through processing). */
        const illegal = await client
            .post(`/api/v1/admin/orders/${draft.id}/status`)
            .loginAs(admin)
            .json({ to_status: "completed" });
        illegal.assertStatus(422);

        /** pending → processing → completed (legal pair). */
        const b = await client.post(`/api/v1/admin/orders/${draft.id}/status`).loginAs(admin).json({ to_status: "processing" });
        b.assertStatus(200);

        const c = await client.post(`/api/v1/admin/orders/${draft.id}/status`).loginAs(admin).json({ to_status: "completed" });
        c.assertStatus(200);
        assert.isNotNull(c.body().data.date_completed_at);

        const history = await OrderStatusHistory.query().where("order_id", Number(draft.id)).orderBy("id", "asc");
        /** State machine writes one row per transition, three transitions = three rows. */
        assert.equal(history.length, 3);
        assert.equal(history[0].toStatus, OrderStatus.Pending);
        assert.equal(history[1].toStatus, OrderStatus.Processing);
        assert.equal(history[2].toStatus, OrderStatus.Completed);
    });

    test("status route requires admin role", async ({ client }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const draft = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 1,
            price: 1_000_000,
        });
        const customer = await UserFactory.create();
        await Customer.create({
            userId: customer.id,
            firstName: "Cust",
            lastName: "Omer",
            countryDefault: "IR",
            isPayingCustomer: false,
        });

        const response = await client
            .post(`/api/v1/admin/orders/${draft.id}/status`)
            .loginAs(customer)
            .json({ to_status: "pending" });
        response.assertStatus(403);
    });
});
