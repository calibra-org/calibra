import { test } from "@japa/runner";

import Customer from "#models/customer";
import User from "#models/user";
import { truncatePhase03Tables } from "#tests/helpers/db";

test.group("POST /api/v1/auth/logout", (group) => {
    group.each.setup(async () => {
        await truncatePhase03Tables();
    });

    test("revokes the current bearer token", async ({ client, assert }) => {
        const user = await User.create({
            email: "logout@calibra.dev",
            passwordHash: "Passw0rd1!",
            role: "customer",
            locale: "fa",
        });
        await Customer.create({ userId: user.id, firstName: "X", lastName: "Y", countryDefault: "IR" });

        const token = await User.accessTokens.create(user);
        const bearer = token.value!.release();

        const logout = await client.post("/api/v1/auth/logout").header("Authorization", `Bearer ${bearer}`);
        logout.assertStatus(200);
        logout.assertAgainstApiSpec();

        const retry = await client.post("/api/v1/auth/logout").header("Authorization", `Bearer ${bearer}`);
        retry.assertStatus(401);
        assert.equal(retry.status(), 401);
    });
});
