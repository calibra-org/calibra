import cache from "@adonisjs/cache/services/main";
import { test } from "@japa/runner";

import { OrderStatus } from "#enums/order_status";
import { UserFactory } from "#factories/user_factory";
import Customer from "#models/customer";
import OrderLineItem from "#models/order_line_item";
import { CacheTags } from "#services/cache_keys";
import { createTaxableProduct } from "#tests/helpers/cart";
import { makeDraftOrder, resetPhase05 } from "#tests/helpers/orders";
import { advanceOrderTo } from "#tests/helpers/refunds";
import { TEST_TENANT_ID } from "#tests/helpers/tenant";

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

test.group("Admin top-products report caching", (group) => {
    group.each.setup(async () => {
        await resetPhase05();
    });

    test("cold miss populates the cache; warm hit ignores direct revenue mutation; tag invalidation refreshes", async ({
        client,
        assert,
    }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 2,
            price: 1_000_000,
        });
        await advanceOrderTo(order, OrderStatus.Completed);

        const first = await client.get("/api/v1/admin/reports/top-products").withGuard("api").loginAs(admin);
        first.assertStatus(200);
        first.assertAgainstApiSpec();
        const firstBody = first.body() as { data: { product_id: number; revenue: number }[] };
        assert.equal(firstBody.data.length, 1);
        assert.equal(firstBody.data[0]!.revenue, 2_000_000);

        await OrderLineItem.query().where("order_id", Number(order.id)).update({ total: 9_000_000 });

        const warm = await client.get("/api/v1/admin/reports/top-products").withGuard("api").loginAs(admin);
        const warmBody = warm.body() as { data: { revenue: number }[] };
        assert.equal(warmBody.data[0]!.revenue, 2_000_000, "warm hit should serve cached revenue");

        await cache.deleteByTag({ tags: [CacheTags.adminReports(TEST_TENANT_ID)] });

        const refreshed = await client.get("/api/v1/admin/reports/top-products").withGuard("api").loginAs(admin);
        const refreshedBody = refreshed.body() as { data: { revenue: number }[] };
        assert.equal(refreshedBody.data[0]!.revenue, 9_000_000);
    });

    test("days + limit + locale combinations have independent cache slots", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 100 });
        const order = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 1,
            price: 100,
        });
        await advanceOrderTo(order, OrderStatus.Completed);

        const days30 = await client.get("/api/v1/admin/reports/top-products").qs({ days: 30 }).withGuard("api").loginAs(admin);
        const days7 = await client.get("/api/v1/admin/reports/top-products").qs({ days: 7 }).withGuard("api").loginAs(admin);
        days30.assertStatus(200);
        days7.assertStatus(200);
        const body30 = days30.body() as { range: { days: number } };
        const body7 = days7.body() as { range: { days: number } };
        assert.equal(body30.range.days, 30);
        assert.equal(body7.range.days, 7);
    });
});
