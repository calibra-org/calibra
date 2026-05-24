import { test } from "@japa/runner";

import Customer from "#models/customer";
import User from "#models/user";
import { truncatePhase03Tables } from "#tests/helpers/db";

async function createAdmin() {
    const user = await User.create({
        email: "admin@calibra.dev",
        passwordHash: "Passw0rd1!",
        role: "admin",
        locale: "fa",
    });
    await Customer.create({
        userId: user.id,
        firstName: "Admin",
        lastName: "User",
        countryDefault: "IR",
    });
    return user;
}

async function createPlainCustomer(email: string) {
    const user = await User.create({
        email,
        passwordHash: "Passw0rd1!",
        role: "customer",
        locale: "fa",
    });
    const customer = await Customer.create({
        userId: user.id,
        firstName: "C",
        lastName: "U",
        countryDefault: "IR",
    });
    return { user, customer };
}

test.group("/api/v1/admin/customers", (group) => {
    group.each.setup(async () => {
        await truncatePhase03Tables();
    });

    test("non-admin user gets 403", async ({ client }) => {
        const { user } = await createPlainCustomer("nope@calibra.dev");
        const response = await client.get("/api/v1/admin/customers").withGuard("api").loginAs(user);
        response.assertStatus(403);
    });

    test("admin can list and search customers", async ({ client, assert }) => {
        const admin = await createAdmin();
        await createPlainCustomer("alice@calibra.dev");
        await createPlainCustomer("bob@calibra.dev");

        const list = await client.get("/api/v1/admin/customers").withGuard("api").loginAs(admin);
        list.assertStatus(200);
        list.assertAgainstApiSpec();
        /** Default list excludes admins per Customer ≠ User: only the two plain customers come back. */
        assert.equal(list.body().data.length, 2);

        const search = await client.get("/api/v1/admin/customers").qs({ search: "alice" }).withGuard("api").loginAs(admin);
        search.assertStatus(200);
        search.assertAgainstApiSpec();
        const matched = search.body().data as Array<{ user: { email: string } | null }>;
        assert.isTrue(matched.some((row) => row.user?.email === "alice@calibra.dev"));
    });

    test("admin can create a customer with admin role", async ({ client, assert }) => {
        const admin = await createAdmin();
        const response = await client.post("/api/v1/admin/customers").withGuard("api").loginAs(admin).json({
            email: "new-admin@calibra.dev",
            password: "Passw0rd1!",
            first_name: "New",
            last_name: "Admin",
            role: "admin",
            country_default: "IR",
        });
        response.assertStatus(201);
        response.assertAgainstApiSpec();
        const created = await User.findBy("email", "new-admin@calibra.dev");
        assert.equal(created?.role, "admin");
    });

    test("soft-delete cascades to users.deleted_at", async ({ client, assert }) => {
        const admin = await createAdmin();
        const { user, customer } = await createPlainCustomer("del@calibra.dev");

        const response = await client.delete(`/api/v1/admin/customers/${customer.id}`).withGuard("api").loginAs(admin);
        response.assertStatus(204);

        const refreshedUser = await User.find(user.id);
        const refreshedCustomer = await Customer.find(customer.id);
        assert.exists(refreshedUser?.deletedAt);
        assert.exists(refreshedCustomer?.deletedAt);
    });

    test("batch endpoint rolls back every change on failure", async ({ client, assert }) => {
        const admin = await createAdmin();
        const before = await Customer.query().count("id as total").firstOrFail();
        const beforeCount = Number((before.$extras as { total: string }).total);

        const response = await client
            .post("/api/v1/admin/customers/batch")
            .withGuard("api")
            .loginAs(admin)
            .json({
                create: [
                    { first_name: "OK", last_name: "Row" },
                    { first_name: "Bad", last_name: "Row", email: "x@y.dev" },
                ],
            });
        response.assertStatus(422);

        const after = await Customer.query().count("id as total").firstOrFail();
        const afterCount = Number((after.$extras as { total: string }).total);
        assert.equal(afterCount, beforeCount);
    });

    test("counts endpoint returns tab buckets + summary aggregates", async ({ client, assert }) => {
        const admin = await createAdmin();
        await createPlainCustomer("a@calibra.dev");
        await createPlainCustomer("b@calibra.dev");
        await Customer.create({ firstName: "Guest", lastName: "One", countryDefault: "IR" });

        const response = await client.get("/api/v1/admin/customers/counts").withGuard("api").loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();

        const body = response.body() as {
            data: {
                all: number;
                account_holders: number;
                guest: number;
                trashed: number;
                summary: { pct_with_account: number };
            };
        };
        assert.equal(body.data.all, 4);
        assert.equal(body.data.account_holders, 3);
        assert.equal(body.data.guest, 1);
        assert.equal(body.data.trashed, 0);
        assert.isNumber(body.data.summary.pct_with_account);
    });

    test("stats endpoint returns lifetime metrics (zeros when no orders)", async ({ client, assert }) => {
        const admin = await createAdmin();
        const { customer } = await createPlainCustomer("stats@calibra.dev");

        const response = await client.get(`/api/v1/admin/customers/${customer.id}/stats`).withGuard("api").loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body() as {
            data: {
                lifetime_order_count: number;
                lifetime_spend_minor: number;
                monthly_spend_series: unknown[];
                favorite_product_id: number | null;
            };
        };
        assert.equal(body.data.lifetime_order_count, 0);
        assert.equal(body.data.lifetime_spend_minor, 0);
        assert.deepEqual(body.data.monthly_spend_series, []);
        assert.equal(body.data.favorite_product_id, null);
    });

    test("list endpoint with include_stats=true returns lifetime fields populated", async ({ client, assert }) => {
        const admin = await createAdmin();
        await createPlainCustomer("s1@calibra.dev");
        await createPlainCustomer("s2@calibra.dev");

        const response = await client
            .get("/api/v1/admin/customers")
            .qs({ include_stats: true, perPage: 5 })
            .withGuard("api")
            .loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body() as {
            data: Array<{ lifetime_order_count: number; lifetime_spend_minor: number; tags: string[] }>;
        };
        for (const row of body.data) {
            assert.isNumber(row.lifetime_order_count);
            assert.isNumber(row.lifetime_spend_minor);
            assert.isArray(row.tags);
        }
    });

    test("SECURITY: admin operators never surface in the customers list, regardless of tab", async ({ client, assert }) => {
        /**
         * Architectural guarantee: every row returned by `/admin/customers` must either be a
         * customer with `user.role === 'customer'` or a guest with `user_id === null`. An admin
         * with `role === 'admin'` who happens to ALSO have a customer row (the bulk-seeder pattern)
         * is still a customer-row, but the underlying USER is an admin — the test asserts the
         * list does not include the admin's row.
         */
        const admin = await createAdmin();
        await createPlainCustomer("regular@calibra.dev");

        const tabs = ["any", "account", "guest", "new"] as const;
        for (const tab of tabs) {
            const response = await client
                .get("/api/v1/admin/customers")
                .qs({ tab, perPage: 100 })
                .withGuard("api")
                .loginAs(admin);
            response.assertStatus(200);
            const body = response.body() as { data: Array<{ user: { role?: string } | null }> };
            for (const row of body.data) {
                if (row.user !== null) {
                    assert.notEqual(row.user.role, "admin", `admin user leaked into tab=${tab} — Customer ≠ User rule violated`);
                }
            }
        }
    });

    test("admin role users do NOT appear in tab=guest", async ({ client, assert }) => {
        const admin = await createAdmin();
        await Customer.create({ firstName: "Guest", lastName: "Walker", countryDefault: "IR" });

        const response = await client
            .get("/api/v1/admin/customers")
            .qs({ tab: "guest", perPage: 100 })
            .withGuard("api")
            .loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body() as { data: Array<{ user: unknown | null }> };
        for (const row of body.data) {
            assert.isNull(row.user);
        }
    });

    test("tab=big narrows the list to customers above the 90th percentile of paid spend", async ({ client, assert }) => {
        /**
         * Without any orders the whole base lands at the 0 spend percentile, so the bucket is
         * empty. Proves the filter actually runs (not a no-op that returns everything). Full
         * revenue-tier seeding lives in the bulk seeder; this is the lightweight invariant.
         */
        const admin = await createAdmin();
        await createPlainCustomer("noorders@calibra.dev");

        const response = await client
            .get("/api/v1/admin/customers")
            .qs({ tab: "big", perPage: 100 })
            .withGuard("api")
            .loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body() as { data: unknown[] };
        assert.equal(body.data.length, 0, "no customers have orders → big-spenders bucket is empty");
    });

    test("list endpoint accepts tab=trashed and returns soft-deleted rows only", async ({ client, assert }) => {
        const admin = await createAdmin();
        const { customer } = await createPlainCustomer("trash@calibra.dev");
        const del = await client.delete(`/api/v1/admin/customers/${customer.id}`).withGuard("api").loginAs(admin);
        del.assertStatus(204);

        const visible = await client.get("/api/v1/admin/customers").qs({ perPage: 100 }).withGuard("api").loginAs(admin);
        visible.assertStatus(200);
        const visibleEmails = (visible.body() as { data: Array<{ user: { email: string } | null }> }).data.map(
            (r) => r.user?.email,
        );
        assert.notInclude(visibleEmails, "trash@calibra.dev");

        const trashed = await client
            .get("/api/v1/admin/customers")
            .qs({ tab: "trashed", perPage: 100 })
            .withGuard("api")
            .loginAs(admin);
        trashed.assertStatus(200);
        trashed.assertAgainstApiSpec();
        const trashedEmails = (trashed.body() as { data: Array<{ user: { email: string } | null }> }).data.map(
            (r) => r.user?.email,
        );
        assert.include(trashedEmails, "trash@calibra.dev");
    });

    test("restore endpoint clears deleted_at on customer + user", async ({ client, assert }) => {
        const admin = await createAdmin();
        const { user, customer } = await createPlainCustomer("restorable@calibra.dev");
        await client.delete(`/api/v1/admin/customers/${customer.id}`).withGuard("api").loginAs(admin);

        const restore = await client.post(`/api/v1/admin/customers/${customer.id}/restore`).withGuard("api").loginAs(admin);
        restore.assertStatus(200);
        restore.assertAgainstApiSpec();

        const fresh = await Customer.find(customer.id);
        const freshUser = await User.find(user.id);
        assert.isNull(fresh?.deletedAt);
        assert.isNull(freshUser?.deletedAt);
    });
});
