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
        status: "active",
    });
    return user;
}

async function createCustomer() {
    return Customer.create({
        firstName: "Tagged",
        lastName: "Target",
        countryDefault: "IR",
        status: "active",
    });
}

test.group("/api/v1/admin/customer-tags + per-customer attach/detach", (group) => {
    group.each.setup(async () => {
        await truncatePhase03Tables();
    });

    test("admin attaches and detaches a tag, list reflects pivot", async ({ client, assert }) => {
        const admin = await createAdmin();
        const customer = await createCustomer();

        const attach = await client
            .post(`/api/v1/admin/customers/${customer.id}/tags`)
            .withGuard("api")
            .loginAs(admin)
            .json({ tag: "VIP" });
        attach.assertStatus(200);
        attach.assertAgainstApiSpec();
        assert.equal(attach.body().data.name, "vip");
        const tagId = attach.body().data.id as string;

        const listTags = await client.get("/api/v1/admin/customer-tags").withGuard("api").loginAs(admin);
        listTags.assertStatus(200);
        listTags.assertAgainstApiSpec();
        assert.isAtLeast(listTags.body().data.length, 1);

        const listCustomers = await client
            .get("/api/v1/admin/customers")
            .qs({ tags: "vip", limit: 50 })
            .withGuard("api")
            .loginAs(admin);
        listCustomers.assertStatus(200);
        const matching = listCustomers.body().data as Array<{ id: string }>;
        assert.deepEqual(matching.map((c) => c.id).sort(), [String(customer.id)].sort());

        const detach = await client
            .delete(`/api/v1/admin/customers/${customer.id}/tags/${tagId}`)
            .withGuard("api")
            .loginAs(admin);
        detach.assertStatus(204);

        const afterDetach = await client
            .get("/api/v1/admin/customers")
            .qs({ tags: "vip", limit: 50 })
            .withGuard("api")
            .loginAs(admin);
        assert.equal(afterDetach.body().data.length, 0);
    });

    test("tag name normalisation rejects invalid chars", async ({ client }) => {
        const admin = await createAdmin();
        const customer = await createCustomer();
        const response = await client
            .post(`/api/v1/admin/customers/${customer.id}/tags`)
            .withGuard("api")
            .loginAs(admin)
            .json({ tag: "wat!?" });
        response.assertStatus(422);
    });

    test("delete tag cascades to pivot", async ({ client, assert }) => {
        const admin = await createAdmin();
        const customer = await createCustomer();
        const create = await client
            .post(`/api/v1/admin/customers/${customer.id}/tags`)
            .withGuard("api")
            .loginAs(admin)
            .json({ tag: "wholesale" });
        const tagId = create.body().data.id as string;

        const del = await client.delete(`/api/v1/admin/customer-tags/${tagId}`).withGuard("api").loginAs(admin);
        del.assertStatus(204);

        const listing = await client
            .get("/api/v1/admin/customers")
            .qs({ tags: "wholesale", limit: 50 })
            .withGuard("api")
            .loginAs(admin);
        assert.equal(listing.body().data.length, 0);
    });
});
