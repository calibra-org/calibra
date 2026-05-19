import { test } from "@japa/runner";

import { OrderStatus } from "#enums/order_status";
import { UserFactory } from "#factories/user_factory";
import Customer from "#models/customer";
import Order from "#models/order";
import { orderStateMachine } from "#services/order_state_machine";
import { createTaxableProduct } from "#tests/helpers/cart";
import { makeDraftOrder, resetPhase05 } from "#tests/helpers/orders";

async function createUserWithCustomer() {
    const user = await UserFactory.create();
    const customer = await Customer.create({
        userId: user.id,
        firstName: "Acc",
        lastName: "Test",
        phone: "+989121234567",
        countryDefault: "IR",
        isPayingCustomer: false,
    });
    return { user, customer };
}

test.group("GET /api/v1/account/orders", (group) => {
    group.each.setup(async () => {
        await resetPhase05();
    });

    test("lists the authenticated customer's orders, excludes drafts", async ({ client, assert }) => {
        const { user, customer } = await createUserWithCustomer();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const draft = await makeDraftOrder({
            customerId: Number(customer.id),
            productId: Number(product.id),
            quantity: 1,
            price: 1_000_000,
        });
        await orderStateMachine.transition(draft, OrderStatus.Pending);
        /** A second draft that should NOT appear in the listing. */
        await makeDraftOrder({
            customerId: Number(customer.id),
            productId: Number(product.id),
            quantity: 1,
            price: 1_000_000,
        });

        const response = await client.get("/api/v1/account/orders").loginAs(user);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body();
        assert.equal(body.data.length, 1);
        assert.equal(body.data[0].status, "pending");
    });

    test("cross-tenant order id returns 404", async ({ client }) => {
        const { user } = await createUserWithCustomer();
        const other = await Customer.create({
            firstName: "X",
            lastName: "Y",
            countryDefault: "IR",
            isPayingCustomer: false,
        });
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const draft = await makeDraftOrder({
            customerId: Number(other.id),
            productId: Number(product.id),
            quantity: 1,
            price: 1_000_000,
        });
        await orderStateMachine.transition(draft, OrderStatus.Pending);

        const response = await client.get(`/api/v1/account/orders/${draft.id}`).loginAs(user);
        response.assertStatus(404);
    });

    test("single-order view includes line items + addresses + history", async ({ client, assert }) => {
        const { user, customer } = await createUserWithCustomer();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const draft = await makeDraftOrder({
            customerId: Number(customer.id),
            productId: Number(product.id),
            quantity: 1,
            price: 1_000_000,
        });
        await orderStateMachine.transition(draft, OrderStatus.Pending);

        const response = await client.get(`/api/v1/account/orders/${draft.id}`).loginAs(user);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body();
        assert.equal(body.data.id, Number(draft.id));
        assert.equal(body.data.line_items.length, 1);
        assert.equal(body.data.status_history.length, 1);
    });

    test("anonymous request → 401", async ({ client }) => {
        const response = await client.get("/api/v1/account/orders");
        response.assertStatus(401);
    });
});

test.group("admin_orders.spec", (group) => {
    group.each.setup(async () => {
        await resetPhase05();
    });

    test("admin list paginated with filter by status", async ({ client, assert }) => {
        const admin = await UserFactory.apply("admin").create();
        await Customer.create({
            userId: admin.id,
            firstName: "Admin",
            lastName: "User",
            countryDefault: "IR",
            isPayingCustomer: false,
        });
        const customer = await Customer.create({
            firstName: "Guest",
            lastName: "User",
            countryDefault: "IR",
            isPayingCustomer: false,
        });
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const a = await makeDraftOrder({
            customerId: Number(customer.id),
            productId: Number(product.id),
            quantity: 1,
            price: 1_000_000,
        });
        const b = await makeDraftOrder({
            customerId: Number(customer.id),
            productId: Number(product.id),
            quantity: 1,
            price: 1_000_000,
        });
        await orderStateMachine.transition(a, OrderStatus.Pending);
        await orderStateMachine.transition(b, OrderStatus.Pending);
        await orderStateMachine.transition(b, OrderStatus.Cancelled);

        const list = await client.get("/api/v1/admin/orders?status=pending").loginAs(admin);
        list.assertStatus(200);
        list.assertAgainstApiSpec();
        assert.equal(list.body().data.length, 1);
        assert.equal(list.body().data[0].status, "pending");
    });

    test("admin transition endpoint runs the state machine + writes history", async ({ client, assert }) => {
        const admin = await UserFactory.apply("admin").create();
        await Customer.create({
            userId: admin.id,
            firstName: "Admin",
            lastName: "User",
            countryDefault: "IR",
            isPayingCustomer: false,
        });
        const customer = await Customer.create({
            firstName: "Guest",
            lastName: "User",
            countryDefault: "IR",
            isPayingCustomer: false,
        });
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const draft = await makeDraftOrder({
            customerId: Number(customer.id),
            productId: Number(product.id),
            quantity: 1,
            price: 1_000_000,
        });

        const response = await client
            .post(`/api/v1/admin/orders/${draft.id}/status`)
            .loginAs(admin)
            .json({ to_status: "pending", reason: "manual confirm" });

        response.assertStatus(200);
        response.assertAgainstApiSpec();
        await draft.refresh();
        assert.equal(draft.status, OrderStatus.Pending);
    });

    test("illegal admin transition returns 422", async ({ client }) => {
        const admin = await UserFactory.apply("admin").create();
        await Customer.create({
            userId: admin.id,
            firstName: "Admin",
            lastName: "User",
            countryDefault: "IR",
            isPayingCustomer: false,
        });
        const customer = await Customer.create({ firstName: "X", lastName: "Y", countryDefault: "IR", isPayingCustomer: false });
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const draft = await makeDraftOrder({
            customerId: Number(customer.id),
            productId: Number(product.id),
            quantity: 1,
            price: 1_000_000,
        });

        const response = await client
            .post(`/api/v1/admin/orders/${draft.id}/status`)
            .loginAs(admin)
            .json({ to_status: "completed" });
        response.assertStatus(422);
    });

    test("admin soft-delete sets deleted_at and removes from list", async ({ client, assert }) => {
        const admin = await UserFactory.apply("admin").create();
        await Customer.create({
            userId: admin.id,
            firstName: "Admin",
            lastName: "User",
            countryDefault: "IR",
            isPayingCustomer: false,
        });
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const draft = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 1,
            price: 1_000_000,
        });

        const response = await client.delete(`/api/v1/admin/orders/${draft.id}`).loginAs(admin);
        response.assertStatus(204);

        const list = await client.get("/api/v1/admin/orders").loginAs(admin);
        assert.equal(list.body().data.length, 0);

        const row = await Order.find(draft.id);
        assert.isNotNull(row!.deletedAt);
    });
});
