import crypto from "node:crypto";
import { test } from "@japa/runner";
import { DateTime } from "luxon";

import PasswordResetToken from "#models/password_reset_token";
import User from "#models/user";
import { truncatePhase03Tables } from "#tests/helpers/db";

test.group("POST /api/v1/auth/password/forgot + /reset", (group) => {
    group.each.setup(async () => {
        await truncatePhase03Tables();
    });

    test("forgot always returns 200, regardless of email match", async ({ client }) => {
        const unknown = await client.post("/api/v1/auth/password/forgot").json({ email: "nobody@calibra.dev" });
        unknown.assertStatus(200);
        unknown.assertAgainstApiSpec();

        await User.create({
            email: "real@calibra.dev",
            passwordHash: "Passw0rd1!",
            role: "customer",
            locale: "fa",
        });
        const known = await client.post("/api/v1/auth/password/forgot").json({ email: "real@calibra.dev" });
        known.assertStatus(200);
        known.assertAgainstApiSpec();
    });

    test("reset with a valid token updates the password and revokes existing tokens", async ({ client, assert }) => {
        const user = await User.create({
            email: "reset@calibra.dev",
            passwordHash: "OldPassw0rd!",
            role: "customer",
            locale: "fa",
        });
        const oldToken = await User.accessTokens.create(user);
        const oldBearer = oldToken.value!.release();

        const plain = crypto.randomBytes(32).toString("hex");
        const hash = crypto.createHash("sha256").update(plain).digest("hex");
        await PasswordResetToken.create({
            userId: user.id,
            tokenHash: hash,
            expiresAt: DateTime.utc().plus({ minutes: 60 }),
        });

        const response = await client.post("/api/v1/auth/password/reset").json({ token: plain, password: "NewPassw0rd1!" });
        response.assertStatus(200);
        response.assertAgainstApiSpec();

        const login = await client.post("/api/v1/auth/login").json({ email: "reset@calibra.dev", password: "NewPassw0rd1!" });
        login.assertStatus(200);
        login.assertAgainstApiSpec();

        const retry = await client.post("/api/v1/auth/logout").header("Authorization", `Bearer ${oldBearer}`);
        retry.assertStatus(401);

        const row = await PasswordResetToken.findBy("token_hash", hash);
        assert.exists(row!.usedAt);
    });

    test("reset with an expired token is rejected", async ({ client }) => {
        const user = await User.create({
            email: "expired@calibra.dev",
            passwordHash: "Passw0rd1!",
            role: "customer",
            locale: "fa",
        });
        const plain = crypto.randomBytes(32).toString("hex");
        const hash = crypto.createHash("sha256").update(plain).digest("hex");
        await PasswordResetToken.create({
            userId: user.id,
            tokenHash: hash,
            expiresAt: DateTime.utc().minus({ minutes: 1 }),
        });

        const response = await client.post("/api/v1/auth/password/reset").json({ token: plain, password: "Passw0rd2!" });
        response.assertStatus(422);
    });

    test("reset with an already-used token is rejected", async ({ client }) => {
        const user = await User.create({
            email: "used@calibra.dev",
            passwordHash: "Passw0rd1!",
            role: "customer",
            locale: "fa",
        });
        const plain = crypto.randomBytes(32).toString("hex");
        const hash = crypto.createHash("sha256").update(plain).digest("hex");
        await PasswordResetToken.create({
            userId: user.id,
            tokenHash: hash,
            expiresAt: DateTime.utc().plus({ minutes: 30 }),
            usedAt: DateTime.utc(),
        });

        const response = await client.post("/api/v1/auth/password/reset").json({ token: plain, password: "Passw0rd2!" });
        response.assertStatus(422);
    });
});
