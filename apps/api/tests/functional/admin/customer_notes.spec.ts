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
        firstName: "Note",
        lastName: "Target",
        countryDefault: "IR",
        status: "active",
    });
}

test.group("/api/v1/admin/customers/:customer_id/notes", (group) => {
    group.each.setup(async () => {
        await truncatePhase03Tables();
    });

    test("non-admin user gets 403", async ({ client }) => {
        const user = await User.create({
            email: "u@calibra.dev",
            passwordHash: "Passw0rd1!",
            role: "customer",
            locale: "fa",
        });
        await Customer.create({ userId: user.id, firstName: "U", lastName: "U", countryDefault: "IR", status: "active" });
        const customer = await createCustomer();
        const response = await client
            .get(`/api/v1/admin/customers/${customer.id}/notes`)
            .withGuard("api")
            .loginAs(user);
        response.assertStatus(403);
    });

    test("admin can create, list, edit, and delete a note", async ({ client, assert }) => {
        const admin = await createAdmin();
        const customer = await createCustomer();

        const create = await client
            .post(`/api/v1/admin/customers/${customer.id}/notes`)
            .withGuard("api")
            .loginAs(admin)
            .json({ body: "first contact recorded" });
        create.assertStatus(201);
        create.assertAgainstApiSpec();
        const noteId = create.body().data.id as string;

        const list = await client
            .get(`/api/v1/admin/customers/${customer.id}/notes`)
            .withGuard("api")
            .loginAs(admin);
        list.assertStatus(200);
        list.assertAgainstApiSpec();
        assert.equal(list.body().data.length, 1);
        assert.equal(list.body().data[0].body, "first contact recorded");
        assert.equal(list.body().data[0].author?.email, "admin@calibra.dev");

        const update = await client
            .patch(`/api/v1/admin/customers/${customer.id}/notes/${noteId}`)
            .withGuard("api")
            .loginAs(admin)
            .json({ body: "updated body" });
        update.assertStatus(200);
        update.assertAgainstApiSpec();
        assert.equal(update.body().data.body, "updated body");

        const del = await client
            .delete(`/api/v1/admin/customers/${customer.id}/notes/${noteId}`)
            .withGuard("api")
            .loginAs(admin);
        del.assertStatus(204);
    });

    test("note on missing customer returns 404", async ({ client }) => {
        const admin = await createAdmin();
        const response = await client
            .post(`/api/v1/admin/customers/9999/notes`)
            .withGuard("api")
            .loginAs(admin)
            .json({ body: "ghost note" });
        response.assertStatus(404);
    });

    test("body length validation rejects empty and over-2000 char bodies", async ({ client }) => {
        const admin = await createAdmin();
        const customer = await createCustomer();
        const empty = await client
            .post(`/api/v1/admin/customers/${customer.id}/notes`)
            .withGuard("api")
            .loginAs(admin)
            .json({ body: "" });
        empty.assertStatus(422);
        const tooLong = await client
            .post(`/api/v1/admin/customers/${customer.id}/notes`)
            .withGuard("api")
            .loginAs(admin)
            .json({ body: "a".repeat(2001) });
        tooLong.assertStatus(422);
    });
});
