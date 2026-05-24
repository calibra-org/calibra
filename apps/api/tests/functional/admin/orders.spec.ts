import { test } from "@japa/runner";

import { OrderStatus } from "#enums/order_status";
import { UserFactory } from "#factories/user_factory";
import Customer from "#models/customer";
import Order from "#models/order";
import { createTaxableProduct } from "#tests/helpers/cart";
import { makeDraftOrder, resetPhase05 } from "#tests/helpers/orders";

/**
 * Functional coverage for the admin Orders surface added alongside the new Orders workbench:
 * `GET /counts`, `POST /:id/mark-shipped`, `POST /:id/resend-confirmation`, and the extended
 * list response (`item_count`, `coupon_codes`, `risk_flags`, `customer_name`, `payment_method_title`).
 * Every happy path asserts against the bundled OpenAPI spec so schema drift fails the suite.
 */

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

async function buyer() {
    const user = await UserFactory.create();
    const customer = await Customer.create({
        userId: user.id,
        firstName: "Buyer",
        lastName: "Person",
        countryDefault: "IR",
        isPayingCustomer: false,
    });
    return { user, customer };
}

test.group("GET /api/v1/admin/orders/counts", (group) => {
    group.each.setup(async () => {
        await resetPhase05();
    });

    test("returns grouped status counts including a trashed bucket", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const a = await makeDraftOrder({ customerId: null, productId: Number(product.id), quantity: 1, price: 1_000_000 });
        const b = await makeDraftOrder({ customerId: null, productId: Number(product.id), quantity: 2, price: 1_000_000 });
        const trashed = await makeDraftOrder({ customerId: null, productId: Number(product.id), quantity: 1, price: 1_000_000 });

        await client.post(`/api/v1/admin/orders/${a.id}/status`).loginAs(admin).json({ to_status: "pending" });
        await client.post(`/api/v1/admin/orders/${b.id}/status`).loginAs(admin).json({ to_status: "pending" });
        await client.delete(`/api/v1/admin/orders/${trashed.id}`).loginAs(admin);

        const res = await client.get("/api/v1/admin/orders/counts").loginAs(admin);
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        const data = res.body().data as Record<string, number>;
        assert.equal(data.all, 2, "two live orders");
        assert.equal(data.draft, 0);
        assert.equal(data.pending, 2);
        assert.equal(data.trashed, 1);
        assert.equal(data.completed, 0);
        assert.equal(data.refunded, 0);
    });

    test("requires admin role", async ({ client }) => {
        const { user } = await buyer();
        const res = await client.get("/api/v1/admin/orders/counts").loginAs(user);
        res.assertStatus(403);
    });

    test("requires authentication", async ({ client }) => {
        const res = await client.get("/api/v1/admin/orders/counts");
        res.assertStatus(401);
    });
});

test.group("POST /api/v1/admin/orders/:id/mark-shipped", (group) => {
    group.each.setup(async () => {
        await resetPhase05();
    });

    test("transitions processing → completed, persists tracking metadata, idempotent re-runs", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({ customerId: null, productId: Number(product.id), quantity: 1, price: 1_000_000 });
        await client.post(`/api/v1/admin/orders/${order.id}/status`).loginAs(admin).json({ to_status: "pending" });
        await client.post(`/api/v1/admin/orders/${order.id}/status`).loginAs(admin).json({ to_status: "processing" });

        const res = await client
            .post(`/api/v1/admin/orders/${order.id}/mark-shipped`)
            .loginAs(admin)
            .json({ tracking_number: "AB123", carrier: "post" });
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        const body = res.body().data;
        assert.equal(body.status, "completed");
        assert.equal(body.shipping_info.tracking_number, "AB123");
        assert.equal(body.shipping_info.carrier, "post");
        assert.isNotNull(body.shipping_info.shipped_at);

        /** Second call updates tracking without re-transitioning. */
        const reshipped = await client
            .post(`/api/v1/admin/orders/${order.id}/mark-shipped`)
            .loginAs(admin)
            .json({ tracking_number: "AB123-UPDATED" });
        reshipped.assertStatus(200);
        reshipped.assertAgainstApiSpec();
        assert.equal(reshipped.body().data.status, "completed");
        assert.equal(reshipped.body().data.shipping_info.tracking_number, "AB123-UPDATED");
    });

    test("rejects shipping from non-processing status", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({ customerId: null, productId: Number(product.id), quantity: 1, price: 1_000_000 });
        /** Draft → markShipped — state machine refuses the implicit completed transition. */
        const res = await client.post(`/api/v1/admin/orders/${order.id}/mark-shipped`).loginAs(admin).json({});
        res.assertStatus(200);
        const fresh = await Order.findOrFail(Number(order.id));
        assert.equal(fresh.status, OrderStatus.Draft, "no transition performed");
    });

    test("requires admin role", async ({ client }) => {
        const { user } = await buyer();
        const res = await client.post("/api/v1/admin/orders/1/mark-shipped").loginAs(user).json({});
        res.assertStatus(403);
    });
});

test.group("POST /api/v1/admin/orders/:id/resend-confirmation", (group) => {
    group.each.setup(async () => {
        await resetPhase05();
    });

    test("returns 202 with a queued envelope", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 500_000 });
        const order = await makeDraftOrder({ customerId: null, productId: Number(product.id), quantity: 1, price: 500_000 });
        const res = await client.post(`/api/v1/admin/orders/${order.id}/resend-confirmation`).loginAs(admin);
        res.assertStatus(202);
        res.assertAgainstApiSpec();
        assert.equal(res.body().data.queued, true);
        assert.equal(res.body().data.order_id, Number(order.id));
    });

    test("requires admin role", async ({ client }) => {
        const { user } = await buyer();
        const res = await client.post("/api/v1/admin/orders/1/resend-confirmation").loginAs(user);
        res.assertStatus(403);
    });
});

test.group("GET /api/v1/admin/orders (extended list shape)", (group) => {
    group.each.setup(async () => {
        await resetPhase05();
    });

    test("surfaces item_count, customer_name, risk_flags, and respects sort=-grand_total", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const small = await makeDraftOrder({ customerId: null, productId: Number(product.id), quantity: 1, price: 1_000_000 });
        const big = await makeDraftOrder({ customerId: null, productId: Number(product.id), quantity: 250, price: 1_000_000 });

        const res = await client.get("/api/v1/admin/orders?sort=-grand_total&perPage=50").loginAs(admin);
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        const data = res.body().data as Array<{
            id: number;
            item_count: number;
            risk_flags: string[];
            customer_name: string;
            payment_method_title: string | null;
        }>;
        assert.isAtLeast(data.length, 2);
        assert.equal(data[0].id, Number(big.id), "highest grand_total first when sort=-grand_total");
        const bigRow = data.find((row) => row.id === Number(big.id));
        assert.isDefined(bigRow);
        assert.isAtLeast(bigRow?.item_count ?? 0, 1);
        assert.include(bigRow?.risk_flags ?? [], "high_value");
        const smallRow = data.find((row) => row.id === Number(small.id));
        assert.isDefined(smallRow);
        assert.isArray(smallRow?.risk_flags);
        assert.isString(smallRow?.payment_method_title ?? "");
    });
});
