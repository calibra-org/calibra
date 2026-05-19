import { test } from "@japa/runner";

import Customer from "#models/customer";
import User from "#models/user";
import { truncatePhase03Tables } from "#tests/helpers/db";

test.group("POST /api/v1/auth/register", (group) => {
    group.each.setup(async () => {
        await truncatePhase03Tables();
    });

    test("happy path returns token and creates a linked user + customer", async ({ client, assert }) => {
        const response = await client.post("/api/v1/auth/register").json({
            email: "test@calibra.dev",
            password: "Passw0rd1!",
            first_name: "علی",
            last_name: "احمدی",
            phone: "09121234567",
        });

        response.assertStatus(201);
        response.assertAgainstApiSpec();
        response.assertBodyContains({
            user: { email: "test@calibra.dev", role: "customer" },
            customer: { first_name: "علی", last_name: "احمدی" },
            token: { type: "bearer" },
        });

        const body = response.body();
        assert.match(body.token.value, /^oat_/);
        assert.exists(body.token.expires_at);

        const user = await User.findBy("email", "test@calibra.dev");
        assert.exists(user);
        const customer = await Customer.findBy("user_id", user!.id);
        assert.exists(customer);
        assert.equal(customer!.phone, "+989121234567");
    });

    test("rejects a duplicate email with 422", async ({ client }) => {
        await client.post("/api/v1/auth/register").json({
            email: "dup@calibra.dev",
            password: "Passw0rd1!",
            first_name: "X",
            last_name: "Y",
        });

        const response = await client.post("/api/v1/auth/register").json({
            email: "dup@calibra.dev",
            password: "Passw0rd1!",
            first_name: "X",
            last_name: "Y",
        });
        response.assertStatus(422);
    });

    test("rejects a weak password with 422", async ({ client }) => {
        const response = await client.post("/api/v1/auth/register").json({
            email: "weak@calibra.dev",
            password: "shortone",
            first_name: "X",
            last_name: "Y",
        });
        response.assertStatus(422);
    });

    test("normalizes the phone on save", async ({ client, assert }) => {
        const response = await client.post("/api/v1/auth/register").json({
            email: "phone@calibra.dev",
            password: "Passw0rd1!",
            first_name: "X",
            last_name: "Y",
            phone: "0912 555 1212",
        });
        response.assertStatus(201);
        response.assertAgainstApiSpec();
        const user = await User.findByOrFail("email", "phone@calibra.dev");
        const customer = await Customer.findByOrFail("user_id", user.id);
        assert.equal(customer.phone, "+989125551212");
    });
});
