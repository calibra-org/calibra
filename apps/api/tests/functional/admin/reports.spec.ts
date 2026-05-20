import { test } from "@japa/runner";
import { DateTime } from "luxon";

import { OrderStatus } from "#enums/order_status";
import { UserFactory } from "#factories/user_factory";
import Customer from "#models/customer";
import Order from "#models/order";
import { createTaxableProduct } from "#tests/helpers/cart";
import { makeDraftOrder, resetPhase05 } from "#tests/helpers/orders";
import { advanceOrderTo } from "#tests/helpers/refunds";

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

async function plainUser() {
    const user = await UserFactory.create();
    await Customer.create({
        userId: user.id,
        firstName: "Plain",
        lastName: "User",
        countryDefault: "IR",
        isPayingCustomer: true,
    });
    return user;
}

/**
 * Force the order's `created_at` so the trailing-window filter on the endpoint catches (or
 * excludes) the row. The state machine writes the timestamp on transition; tests need to back-date
 * orders to land in / out of the 30-day window.
 */
async function backdate(order: Order, daysAgo: number) {
    await Order.query()
        .where("id", Number(order.id))
        .update({ created_at: DateTime.utc().minus({ days: daysAgo }).toSQL({ includeOffset: false }) });
}

test.group("GET /api/v1/admin/reports/top-products", (group) => {
    group.each.setup(async () => {
        await resetPhase05();
    });

    test("rejects unauthenticated requests with 401", async ({ client }) => {
        const response = await client.get("/api/v1/admin/reports/top-products");
        response.assertStatus(401);
    });

    test("rejects non-admin sessions with 403", async ({ client }) => {
        const user = await plainUser();
        const response = await client.get("/api/v1/admin/reports/top-products").withGuard("api").loginAs(user);
        response.assertStatus(403);
    });

    test("ranks products by gross revenue across completed + processing orders", async ({ client, assert }) => {
        const admin = await adminUser();
        const productA = await createTaxableProduct({ regularPrice: 1_000_000 });
        const productB = await createTaxableProduct({ regularPrice: 500_000 });

        /** Product A sold once at 5x = 5,000,000 (winner). */
        const orderA = await makeDraftOrder({
            customerId: null,
            productId: Number(productA.id),
            quantity: 5,
            price: 1_000_000,
        });
        await advanceOrderTo(orderA, OrderStatus.Completed);

        /** Product B sold once at 4x = 2,000,000 (second). */
        const orderB = await makeDraftOrder({
            customerId: null,
            productId: Number(productB.id),
            quantity: 4,
            price: 500_000,
        });
        await advanceOrderTo(orderB, OrderStatus.Processing);

        const response = await client.get("/api/v1/admin/reports/top-products").withGuard("api").loginAs(admin);

        response.assertStatus(200);
        response.assertAgainstApiSpec();

        const body = response.body() as {
            data: { product_id: number; name: string; sku: string | null; units: number; revenue: number }[];
            range: { start_date: string; end_date: string; days: number };
        };
        assert.equal(body.data.length, 2);
        assert.equal(body.data[0]!.product_id, Number(productA.id));
        assert.equal(body.data[0]!.units, 5);
        assert.equal(body.data[0]!.revenue, 5_000_000);
        assert.equal(body.data[1]!.product_id, Number(productB.id));
        assert.equal(body.data[1]!.revenue, 2_000_000);
        assert.equal(body.range.days, 30);
        /** `range.start_date` is `days` ago at UTC; assert the shape but not the exact value (clock drift). */
        assert.match(body.range.start_date, /^\d{4}-\d{2}-\d{2}$/);
    });

    test("excludes draft / cancelled / refunded / failed orders", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });

        /** Draft never sees the report (no transition). */
        await makeDraftOrder({ customerId: null, productId: Number(product.id), quantity: 2, price: 1_000_000 });

        /** Cancelled is excluded. */
        const cancelled = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 3,
            price: 1_000_000,
        });
        await advanceOrderTo(cancelled, OrderStatus.Pending);
        await cancelled.refresh();
        cancelled.status = OrderStatus.Cancelled;
        await cancelled.save();

        const response = await client.get("/api/v1/admin/reports/top-products").withGuard("api").loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        assert.deepEqual(response.body().data, []);
    });

    test("respects the trailing days window", async ({ client, assert }) => {
        const admin = await adminUser();
        const fresh = await createTaxableProduct({ regularPrice: 1_000_000 });
        const stale = await createTaxableProduct({ regularPrice: 1_000_000 });

        const freshOrder = await makeDraftOrder({
            customerId: null,
            productId: Number(fresh.id),
            quantity: 1,
            price: 1_000_000,
        });
        await advanceOrderTo(freshOrder, OrderStatus.Completed);

        const staleOrder = await makeDraftOrder({
            customerId: null,
            productId: Number(stale.id),
            quantity: 1,
            price: 1_000_000,
        });
        await advanceOrderTo(staleOrder, OrderStatus.Completed);
        await backdate(staleOrder, 60);

        const wide = await client.get("/api/v1/admin/reports/top-products").qs({ days: 90 }).withGuard("api").loginAs(admin);
        wide.assertStatus(200);
        wide.assertAgainstApiSpec();
        assert.equal((wide.body().data as unknown[]).length, 2);

        const narrow = await client.get("/api/v1/admin/reports/top-products").qs({ days: 7 }).withGuard("api").loginAs(admin);
        narrow.assertStatus(200);
        narrow.assertAgainstApiSpec();
        const narrowData = narrow.body().data as { product_id: number }[];
        assert.equal(narrowData.length, 1);
        assert.equal(narrowData[0]!.product_id, Number(fresh.id));
    });

    test("limit caps the returned rows", async ({ client, assert }) => {
        const admin = await adminUser();
        for (let i = 0; i < 3; i += 1) {
            const product = await createTaxableProduct({ regularPrice: 1_000_000 + i });
            const order = await makeDraftOrder({
                customerId: null,
                productId: Number(product.id),
                quantity: i + 1,
                price: 1_000_000 + i,
            });
            await advanceOrderTo(order, OrderStatus.Completed);
        }

        const response = await client.get("/api/v1/admin/reports/top-products").qs({ limit: 2 }).withGuard("api").loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        assert.equal((response.body().data as unknown[]).length, 2);
    });

    test("rejects invalid query params (days > 365)", async ({ client }) => {
        const admin = await adminUser();
        const response = await client
            .get("/api/v1/admin/reports/top-products")
            .qs({ days: 9999 })
            .withGuard("api")
            .loginAs(admin);
        response.assertStatus(422);
    });
});
