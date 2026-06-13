import { test } from "@japa/runner";

import User from "#models/user";
import { TEST_TENANT_ID } from "#tests/helpers/tenant";

/**
 * Forced password change. An admin carrying `must_change_password` is 423'd on every admin route
 * (the column read is the floor — even a raw bearer token hits it) until they POST
 * `/api/v1/auth/password/change`, which clears the flag. `/auth/password/change` itself is never
 * gated.
 */
const ADMIN_ROUTE = "/api/v1/admin/settings/general";

async function makeAdmin(mustChange: boolean): Promise<User> {
    return User.create({
        tenantId: TEST_TENANT_ID,
        email: `force-${mustChange}-${Date.now()}@calibra.dev`,
        passwordHash: "Passw0rd1!",
        role: "admin",
        locale: "fa",
        mustChangePassword: mustChange,
    });
}

test.group("Forced password change", () => {
    test("an admin with must_change_password is 423'd on an admin route", async ({ client }) => {
        const admin = await makeAdmin(true);
        const res = await client.get(ADMIN_ROUTE).header("X-Calibra-Tenant", "test").withGuard("api").loginAs(admin);
        res.assertStatus(423);
    });

    test("changing the password clears the flag and unblocks admin routes", async ({ client, assert }) => {
        const admin = await makeAdmin(true);
        const change = await client
            .post("/api/v1/auth/password/change")
            .header("X-Calibra-Tenant", "test")
            .withGuard("api")
            .loginAs(admin)
            .json({ password: "NewPassw0rd9!" });
        change.assertStatus(200);

        await admin.refresh();
        assert.isFalse(admin.mustChangePassword);

        const after = await client.get(ADMIN_ROUTE).header("X-Calibra-Tenant", "test").withGuard("api").loginAs(admin);
        after.assertStatus(200);
    });

    test("an admin without the flag is not gated", async ({ client }) => {
        const admin = await makeAdmin(false);
        const res = await client.get(ADMIN_ROUTE).header("X-Calibra-Tenant", "test").withGuard("api").loginAs(admin);
        res.assertStatus(200);
    });

    test("/auth/me exposes must_change_password so the panel can redirect", async ({ client, assert }) => {
        const admin = await makeAdmin(true);
        const res = await client.get("/api/v1/auth/me").header("X-Calibra-Tenant", "test").withGuard("api").loginAs(admin);
        res.assertStatus(200);
        assert.isTrue(res.body().user.must_change_password);
    });
});
