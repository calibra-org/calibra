import hash from "@adonisjs/core/services/hash";
import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";
import { DateTime } from "luxon";

import User from "#models/user";
import { TEST_TENANT_ID, TEST_TENANT_SLUG } from "#tests/helpers/tenant";

const SECOND_TENANT_ID = 100_001;
const SECOND_TENANT_SLUG = "otp-tenant-b";

/** Seed a verifiable OTP row directly (the SMS log driver never exposes the plaintext). */
async function seedOtp(tenantId: number, identifier: string, code: string): Promise<void> {
    const now = DateTime.utc().toSQL()!;
    await db
        .connection("postgres_admin")
        .table("otp_codes")
        .insert({
            tenant_id: tenantId,
            identifier,
            channel: "sms",
            purpose: "login",
            code_hash: await hash.make(code),
            expires_at: DateTime.utc().plus({ minutes: 5 }).toSQL()!,
            attempts: 0,
            consumed_at: null,
            created_at: now,
        });
}

/** A second active tenant so cross-tenant isolation can be exercised over HTTP. */
async function ensureSecondTenant(): Promise<void> {
    const admin = db.connection("postgres_admin");
    const now = DateTime.utc().toSQL()!;
    const plan = await admin.from("plans").where("key", "starter").firstOrFail();
    await admin
        .table("tenants")
        .insert({
            id: SECOND_TENANT_ID,
            slug: SECOND_TENANT_SLUG,
            name: "OTP Tenant B",
            status: "active",
            plan_id: Number(plan.id),
            db_tier: "shared",
            template_key: "default",
            currency_code: "IRR",
            primary_locale: "fa",
            created_at: now,
            updated_at: now,
        })
        .onConflict("id")
        .ignore();
}

test.group("Auth OTP", (group) => {
    group.each.setup(async () => {
        await ensureSecondTenant();
        /**
         * Clear stale codes only. Each test uses distinct identifiers, so user rows never collide
         * across tests; deleting users in the shared test tenant would cascade-fail against rows
         * other specs left behind.
         */
        await db.connection("postgres_admin").from("otp_codes").delete();
    });

    test("request returns 200 for an unknown identifier (no enumeration)", async ({ client, assert }) => {
        const response = await client.post("/api/v1/auth/otp/request").json({ identifier: "09120009999", channel: "sms" });
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        assert.isNumber(response.body().data.expires_in);
    });

    test("verify mints a bearer token that authenticates /auth/me", async ({ client, assert }) => {
        const identifier = "09121110000";
        await seedOtp(TEST_TENANT_ID, identifier, "123456");

        const verify = await client.post("/api/v1/auth/otp/verify").json({ identifier, code: "123456" });
        verify.assertStatus(200);
        verify.assertAgainstApiSpec();
        const token = verify.body().data.token.value as string;
        assert.isString(token);

        const me = await client.get("/api/v1/auth/me").header("Authorization", `Bearer ${token}`);
        me.assertStatus(200);
        me.assertAgainstApiSpec();
        assert.equal(me.body().user.id, verify.body().data.user.id);
    });

    test("invalid code returns 422 without minting a token", async ({ client }) => {
        const identifier = "09121110001";
        await seedOtp(TEST_TENANT_ID, identifier, "123456");
        const response = await client.post("/api/v1/auth/otp/verify").json({ identifier, code: "000000" });
        response.assertStatus(422);
    });

    test("same phone at tenant A and tenant B yields two distinct users", async ({ client, assert }) => {
        const identifier = "09125550000";
        await seedOtp(TEST_TENANT_ID, identifier, "123456");
        await seedOtp(SECOND_TENANT_ID, identifier, "123456");

        const a = await client
            .post("/api/v1/auth/otp/verify")
            .header("X-Calibra-Tenant", TEST_TENANT_SLUG)
            .json({ identifier, code: "123456" });
        a.assertStatus(200);

        const b = await client
            .post("/api/v1/auth/otp/verify")
            .header("X-Calibra-Tenant", SECOND_TENANT_SLUG)
            .json({ identifier, code: "123456" });
        b.assertStatus(200);

        const idA = String(a.body().data.user.id);
        const idB = String(b.body().data.user.id);
        assert.notEqual(idA, idB, "the same phone must resolve to a distinct user per tenant");

        const userA = await User.query({ client: db.connection("postgres_admin") })
            .where("id", idA)
            .firstOrFail();
        const userB = await User.query({ client: db.connection("postgres_admin") })
            .where("id", idB)
            .firstOrFail();
        assert.equal(Number(userA.tenantId), TEST_TENANT_ID);
        assert.equal(Number(userB.tenantId), SECOND_TENANT_ID);
    });

    test("email + password login still works", async ({ client }) => {
        const user = await User.create({
            email: "otp-login@calibra.dev",
            passwordHash: "Passw0rd1!",
            role: "customer",
            locale: "fa",
        });
        await db
            .connection("postgres_admin")
            .table("customers")
            .insert({
                tenant_id: TEST_TENANT_ID,
                user_id: Number(user.id),
                first_name: "O",
                last_name: "L",
                created_at: DateTime.utc().toSQL()!,
                updated_at: DateTime.utc().toSQL()!,
            });

        const response = await client.post("/api/v1/auth/login").json({ email: "otp-login@calibra.dev", password: "Passw0rd1!" });
        response.assertStatus(200);
        response.assertAgainstApiSpec();
    });
});
