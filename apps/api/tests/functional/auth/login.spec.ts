import { test } from "@japa/runner";
import { DateTime } from "luxon";

import Customer from "#models/customer";
import User from "#models/user";
import { truncatePhase03Tables } from "#tests/helpers/db";

test.group("POST /api/v1/auth/login", (group) => {
    group.each.setup(async () => {
        await truncatePhase03Tables();
    });

    test("returns a bearer token when credentials match", async ({ client, assert }) => {
        const user = await User.create({
            email: "login@calibra.dev",
            passwordHash: "Passw0rd1!",
            role: "customer",
            locale: "fa",
        });
        await Customer.create({ userId: user.id, firstName: "X", lastName: "Y", countryDefault: "IR" });

        const response = await client.post("/api/v1/auth/login").json({ email: "login@calibra.dev", password: "Passw0rd1!" });

        response.assertStatus(200);
        response.assertAgainstApiSpec();
        response.assertBodyContains({ user: { email: "login@calibra.dev" }, token: { type: "bearer" } });
        const body = response.body();
        assert.match(body.token.value, /^oat_/);
    });

    test("rejects a wrong password", async ({ client }) => {
        await User.create({
            email: "wrongpw@calibra.dev",
            passwordHash: "Passw0rd1!",
            role: "customer",
            locale: "fa",
        });
        const response = await client.post("/api/v1/auth/login").json({ email: "wrongpw@calibra.dev", password: "BadPassw0rd!" });
        response.assertStatus(400);
    });

    test("rejects an unknown email", async ({ client }) => {
        const response = await client.post("/api/v1/auth/login").json({ email: "ghost@calibra.dev", password: "Passw0rd1!" });
        response.assertStatus(400);
    });

    test("rejects a soft-deleted user", async ({ client }) => {
        await User.create({
            email: "deleted@calibra.dev",
            passwordHash: "Passw0rd1!",
            role: "customer",
            locale: "fa",
            deletedAt: DateTime.utc(),
        });
        const response = await client.post("/api/v1/auth/login").json({ email: "deleted@calibra.dev", password: "Passw0rd1!" });
        response.assertStatus(401);
    });
});
