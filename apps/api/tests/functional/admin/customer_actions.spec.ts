import { test } from "@japa/runner";

import Customer from "#models/customer";
import CustomerNote from "#models/customer_note";
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

test.group("/api/v1/admin/customers actions", (group) => {
    group.each.setup(async () => {
        await truncatePhase03Tables();
    });

    test("convert-to-account links a guest to a fresh user", async ({ client, assert }) => {
        const admin = await createAdmin();
        const guest = await Customer.create({
            firstName: "Guest",
            lastName: "X",
            countryDefault: "IR",
            status: "active",
        });

        const response = await client
            .post(`/api/v1/admin/customers/${guest.id}/convert-to-account`)
            .withGuard("api")
            .loginAs(admin)
            .json({ email: "new-account@calibra.dev", password: "Passw0rd1!" });
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body() as { data: { user_id: string | null; user: { email: string } } };
        assert.equal(body.data.user.email, "new-account@calibra.dev");
        assert.isNotNull(body.data.user_id);

        const refreshed = await Customer.find(guest.id);
        assert.isNotNull(refreshed?.userId);
    });

    test("convert-to-account 409 when customer already has an account", async ({ client }) => {
        const admin = await createAdmin();
        const existingUser = await User.create({
            email: "has-account@calibra.dev",
            passwordHash: "Passw0rd1!",
            role: "customer",
            locale: "fa",
        });
        const customer = await Customer.create({
            userId: existingUser.id,
            firstName: "Has",
            lastName: "Account",
            countryDefault: "IR",
            status: "active",
        });

        const response = await client
            .post(`/api/v1/admin/customers/${customer.id}/convert-to-account`)
            .withGuard("api")
            .loginAs(admin)
            .json({ email: "new@calibra.dev", password: "Passw0rd1!" });
        response.assertStatus(409);
    });

    test("send-password-reset 400 for guest customer", async ({ client }) => {
        const admin = await createAdmin();
        const guest = await Customer.create({
            firstName: "G",
            lastName: "G",
            countryDefault: "IR",
            status: "active",
        });
        const response = await client
            .post(`/api/v1/admin/customers/${guest.id}/send-password-reset`)
            .withGuard("api")
            .loginAs(admin);
        response.assertStatus(400);
    });

    test("merge reassigns orders + notes and soft-deletes duplicate", async ({ client, assert }) => {
        const admin = await createAdmin();
        const primary = await Customer.create({
            firstName: "Primary",
            lastName: "P",
            countryDefault: "IR",
            status: "active",
        });
        const dup = await Customer.create({
            firstName: "Dup",
            lastName: "D",
            countryDefault: "IR",
            status: "active",
        });
        await CustomerNote.create({ customerId: Number(dup.id), body: "merge me", authorUserId: Number(admin.id) });

        const response = await client
            .post("/api/v1/admin/customers/merge")
            .withGuard("api")
            .loginAs(admin)
            .json({ primary_id: Number(primary.id), duplicate_ids: [Number(dup.id)] });
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body() as { data: { merged_count: number } };
        assert.equal(body.data.merged_count, 1);

        const dupAfter = await Customer.find(dup.id);
        assert.isNotNull(dupAfter?.deletedAt);
        const noteAfter = await CustomerNote.query().where("customer_id", Number(primary.id));
        assert.equal(noteAfter.length, 1);
        assert.equal(noteAfter[0].body, "merge me");
    });

    test("timeline merges note + status sources", async ({ client, assert }) => {
        const admin = await createAdmin();
        const customer = await Customer.create({
            firstName: "Time",
            lastName: "Line",
            countryDefault: "IR",
            status: "active",
        });
        await client
            .post(`/api/v1/admin/customers/${customer.id}/notes`)
            .withGuard("api")
            .loginAs(admin)
            .json({ body: "noted" });
        await client
            .patch(`/api/v1/admin/customers/${customer.id}/status`)
            .withGuard("api")
            .loginAs(admin)
            .json({ status: "suspended" });

        const response = await client
            .get(`/api/v1/admin/customers/${customer.id}/timeline`)
            .withGuard("api")
            .loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body() as { data: Array<{ kind: string }> };
        const kinds = body.data.map((r) => r.kind).sort();
        assert.deepEqual(kinds, ["note", "status"]);
    });
});
