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
        assert.isAtLeast(list.body().data.length, 3);

        const search = await client
            .get("/api/v1/admin/customers")
            .qs({ search: "alice" })
            .withGuard("api")
            .loginAs(admin);
        search.assertStatus(200);
        const matched = search.body().data as Array<{ user: { email: string } | null }>;
        assert.isTrue(matched.some((row) => row.user?.email === "alice@calibra.dev"));
    });

    test("admin can create a customer with admin role", async ({ client, assert }) => {
        const admin = await createAdmin();
        const response = await client
            .post("/api/v1/admin/customers")
            .withGuard("api")
            .loginAs(admin)
            .json({
                email: "new-admin@calibra.dev",
                password: "Passw0rd1!",
                first_name: "New",
                last_name: "Admin",
                role: "admin",
                country_default: "IR",
            });
        response.assertStatus(201);
        const created = await User.findBy("email", "new-admin@calibra.dev");
        assert.equal(created?.role, "admin");
    });

    test("soft-delete cascades to users.deleted_at", async ({ client, assert }) => {
        const admin = await createAdmin();
        const { user, customer } = await createPlainCustomer("del@calibra.dev");

        const response = await client
            .delete(`/api/v1/admin/customers/${customer.id}`)
            .withGuard("api")
            .loginAs(admin);
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
});
