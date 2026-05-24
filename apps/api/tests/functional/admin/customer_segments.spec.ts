import { test } from "@japa/runner";

import Customer from "#models/customer";
import User from "#models/user";
import { truncatePhase03Tables } from "#tests/helpers/db";

async function createAdmin(email = "admin@calibra.dev") {
    const user = await User.create({
        email,
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

test.group("/api/v1/admin/customer-segments (owner-scoped)", (group) => {
    group.each.setup(async () => {
        await truncatePhase03Tables();
    });

    test("admin creates, lists, updates, and deletes a segment", async ({ client, assert }) => {
        const admin = await createAdmin();
        const create = await client
            .post("/api/v1/admin/customer-segments")
            .withGuard("api")
            .loginAs(admin)
            .json({ name: "VIPs", filters: { tags: "vip" }, is_pinned: true });
        create.assertStatus(201);
        create.assertAgainstApiSpec();
        const id = create.body().data.id as string;

        const list = await client.get("/api/v1/admin/customer-segments").withGuard("api").loginAs(admin);
        list.assertStatus(200);
        list.assertAgainstApiSpec();
        assert.equal(list.body().data.length, 1);
        assert.equal(list.body().data[0].is_pinned, true);

        const update = await client
            .patch(`/api/v1/admin/customer-segments/${id}`)
            .withGuard("api")
            .loginAs(admin)
            .json({ name: "Best VIPs", filters: { tags: "vip,top" }, is_pinned: false });
        update.assertStatus(200);
        update.assertAgainstApiSpec();
        assert.equal(update.body().data.name, "Best VIPs");

        const del = await client.delete(`/api/v1/admin/customer-segments/${id}`).withGuard("api").loginAs(admin);
        del.assertStatus(204);
    });

    test("admins cannot read each other's segments", async ({ client, assert }) => {
        const adminA = await createAdmin("a@calibra.dev");
        const adminB = await createAdmin("b@calibra.dev");
        await client
            .post("/api/v1/admin/customer-segments")
            .withGuard("api")
            .loginAs(adminA)
            .json({ name: "Private", filters: {} });

        const listB = await client.get("/api/v1/admin/customer-segments").withGuard("api").loginAs(adminB);
        listB.assertStatus(200);
        assert.equal(listB.body().data.length, 0);
    });
});
