import { test } from "@japa/runner";

import Customer from "#models/customer";
import CustomerIranProfile from "#models/customer_iran_profile";
import User from "#models/user";
import { truncatePhase03Tables } from "#tests/helpers/db";

async function createCustomer(email: string, country = "IR") {
    const user = await User.create({
        email,
        passwordHash: "Passw0rd1!",
        role: "customer",
        locale: "fa",
    });
    const customer = await Customer.create({
        userId: user.id,
        firstName: "F",
        lastName: "L",
        phone: "+989121234567",
        countryDefault: country,
    });
    return { user, customer };
}

test.group("GET /api/v1/account/me", (group) => {
    group.each.setup(async () => {
        await truncatePhase03Tables();
    });

    test("returns user, customer, and profile_extensions when iran profile is absent", async ({
        client,
        assert,
    }) => {
        const { user } = await createCustomer("me@calibra.dev", "IR");

        const response = await client.get("/api/v1/account/me").withGuard("api").loginAs(user);
        response.assertStatus(200);

        const body = response.body();
        assert.equal(body.user.email, "me@calibra.dev");
        assert.deepEqual(body.customer.profile_extensions, {});
        assert.notProperty(body.customer.profile_extensions, "iran");
    });

    test("returns the iran extension when a customer_iran_profiles row exists", async ({
        client,
        assert,
    }) => {
        const { user, customer } = await createCustomer("withiran@calibra.dev");
        await CustomerIranProfile.create({
            customerId: customer.id,
            nationalId: "1234567891",
            legalCompanyNameFa: "شرکت تست",
        });

        const response = await client.get("/api/v1/account/me").withGuard("api").loginAs(user);
        response.assertStatus(200);
        const body = response.body();
        assert.property(body.customer.profile_extensions, "iran");
        assert.equal(body.customer.profile_extensions.iran.national_id, "1234567891");
        assert.equal(body.customer.profile_extensions.iran.legal_company_name_fa, "شرکت تست");
    });

    test("rejects unauthenticated callers with 401", async ({ client }) => {
        const response = await client.get("/api/v1/account/me");
        response.assertStatus(401);
    });
});

test.group("PUT /api/v1/account/me", (group) => {
    group.each.setup(async () => {
        await truncatePhase03Tables();
    });

    test("updates allowed customer fields and upserts iran extension", async ({ client, assert }) => {
        const { user } = await createCustomer("update@calibra.dev");

        const response = await client
            .put("/api/v1/account/me")
            .withGuard("api")
            .loginAs(user)
            .json({
                first_name: "تغییر",
                last_name: "نام",
                phone: "09125550000",
                iran_extension: { national_id: "1234567891" },
            });

        response.assertStatus(200);
        const body = response.body();
        assert.equal(body.customer.first_name, "تغییر");
        assert.equal(body.customer.last_name, "نام");
        assert.equal(body.customer.phone, "+989125550000");
        assert.equal(body.customer.profile_extensions.iran.national_id, "1234567891");
    });

    test("rejects a bad national_id checksum with 422", async ({ client }) => {
        const { user } = await createCustomer("badnid@calibra.dev");
        const response = await client
            .put("/api/v1/account/me")
            .withGuard("api")
            .loginAs(user)
            .json({ iran_extension: { national_id: "1234567890" } });
        response.assertStatus(422);
    });

    test("succeeds when the iran_extension is omitted entirely", async ({ client }) => {
        const { user } = await createCustomer("noiran@calibra.dev");
        const response = await client
            .put("/api/v1/account/me")
            .withGuard("api")
            .loginAs(user)
            .json({ first_name: "X" });
        response.assertStatus(200);
    });

    test("does not expose iran extension for a US-default customer that never set one", async ({
        client,
        assert,
    }) => {
        const { user } = await createCustomer("us@calibra.dev", "US");
        const response = await client
            .put("/api/v1/account/me")
            .withGuard("api")
            .loginAs(user)
            .json({ first_name: "John" });
        response.assertStatus(200);
        assert.notProperty(response.body().customer.profile_extensions, "iran");
    });

    test("silently ignores attempts to change email", async ({ client, assert }) => {
        const { user } = await createCustomer("noemailchange@calibra.dev");
        const response = await client
            .put("/api/v1/account/me")
            .withGuard("api")
            .loginAs(user)
            .json({ email: "hijack@calibra.dev", first_name: "Stable" });
        response.assertStatus(200);
        const refreshed = await User.findOrFail(user.id);
        assert.equal(refreshed.email, "noemailchange@calibra.dev");
    });

    test("rejects unauthenticated callers with 401", async ({ client }) => {
        const response = await client.put("/api/v1/account/me").json({ first_name: "X" });
        response.assertStatus(401);
    });
});
