import cache from "@adonisjs/cache/services/main";
import { test } from "@japa/runner";

import { OrderStatus } from "#enums/order_status";
import { UserFactory } from "#factories/user_factory";
import Customer from "#models/customer";
import { CacheTags } from "#services/cache_keys";
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

test.group("Admin customer-stats caching", (group) => {
    group.each.setup(async () => {
        await resetPhase05();
    });

    test("counts endpoint — cold miss populates, warm hit ignores new customer, tag invalidation refreshes", async ({
        client,
        assert,
    }) => {
        const admin = await adminUser();

        const first = await client.get("/api/v1/admin/customers/counts").withGuard("api").loginAs(admin);
        first.assertStatus(200);
        first.assertAgainstApiSpec();
        const firstAll = first.body().data.all;

        await Customer.create({
            firstName: "Late",
            lastName: "Arrival",
            countryDefault: "IR",
            isPayingCustomer: false,
        });

        const warm = await client.get("/api/v1/admin/customers/counts").withGuard("api").loginAs(admin);
        assert.equal(warm.body().data.all, firstAll, "warm hit should serve cached counts");

        await cache.deleteByTag({ tags: [CacheTags.adminCustomers] });

        const refreshed = await client.get("/api/v1/admin/customers/counts").withGuard("api").loginAs(admin);
        assert.equal(refreshed.body().data.all, firstAll + 1);
    });

    test("single-customer stats — order finalization invalidates the admin:customer tag", async ({ client, assert }) => {
        const admin = await adminUser();
        const customer = await Customer.create({
            firstName: "Buyer",
            lastName: "One",
            countryDefault: "IR",
            isPayingCustomer: false,
        });
        const product = await createTaxableProduct({ regularPrice: 500_000 });

        const first = await client
            .get(`/api/v1/admin/customers/${Number(customer.id)}/stats`)
            .withGuard("api")
            .loginAs(admin);
        first.assertStatus(200);
        first.assertAgainstApiSpec();
        assert.equal(first.body().data.lifetime_order_count, 0);

        const order = await makeDraftOrder({
            customerId: Number(customer.id),
            productId: Number(product.id),
            quantity: 1,
            price: 500_000,
        });
        await advanceOrderTo(order, OrderStatus.Completed);

        const refreshed = await client
            .get(`/api/v1/admin/customers/${Number(customer.id)}/stats`)
            .withGuard("api")
            .loginAs(admin);
        assert.equal(refreshed.body().data.lifetime_order_count, 1, "order:completed should invalidate this customer's cache");
    });
});
