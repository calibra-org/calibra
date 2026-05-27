import { test } from "@japa/runner";

import Customer from "#models/customer";
import PaymentGateway from "#models/payment_gateway";
import User from "#models/user";
import { resetPhase08 } from "#tests/helpers/payments";

async function createAdmin(): Promise<User> {
    const user = await User.create({ email: "admin@calibra.dev", passwordHash: "Passw0rd1!", role: "admin", locale: "fa" });
    await Customer.create({ userId: user.id, firstName: "A", lastName: "U", countryDefault: "IR" });
    return user;
}

async function createPlainUser(email: string): Promise<User> {
    const user = await User.create({ email, passwordHash: "Passw0rd1!", role: "customer", locale: "fa" });
    await Customer.create({ userId: user.id, firstName: "C", lastName: "U", countryDefault: "IR" });
    return user;
}

test.group("/api/v1/admin/payment-gateways", (group) => {
    group.each.setup(async () => {
        await resetPhase08();
    });

    test("non-admin → 403", async ({ client }) => {
        const user = await createPlainUser("nope@calibra.dev");
        const response = await client.get("/api/v1/admin/payment-gateways").withGuard("api").loginAs(user);
        response.assertStatus(403);
    });

    test("admin GET lists all gateways and surfaces implementation_status for each", async ({ client, assert }) => {
        const admin = await createAdmin();
        const response = await client.get("/api/v1/admin/payment-gateways").withGuard("api").loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const list = response.body().data as Array<{ code: string; implementation_status: "stub" | "live" }>;
        const byCode = new Map(list.map((g) => [g.code, g.implementation_status]));
        assert.equal(byCode.get("zarinpal"), "stub");
        assert.equal(byCode.get("idpay"), "stub");
        assert.equal(byCode.get("cod"), "live");
        assert.equal(byCode.get("bank_transfer"), "live");
    });

    test("PATCH on a live gateway merges settings; sensitive keys still mask on the response", async ({ client, assert }) => {
        const admin = await createAdmin();
        const bank = await PaymentGateway.findByOrFail("code", "bank_transfer");

        const response = await client
            .patch(`/api/v1/admin/payment-gateways/${Number(bank.id)}`)
            .withGuard("api")
            .loginAs(admin)
            .json({ enabled: true, settings: { iban: "IR0123456789012345678901", currency_display: "IRT" } });

        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body().data as { enabled: boolean; settings: Record<string, string> };
        assert.isTrue(body.enabled);
        assert.equal(body.settings.iban, "IR0123456789012345678901");
        assert.equal(body.settings.currency_display, "IRT");

        const reloaded = await PaymentGateway.findOrFail(Number(bank.id));
        const settings = reloaded.settings as Record<string, unknown>;
        assert.equal(settings.iban, "IR0123456789012345678901");
        assert.equal(settings.currency_display, "IRT");
    });

    test("PATCH that only rotates settings on a live gateway leaves enabled alone", async ({ client, assert }) => {
        const admin = await createAdmin();
        const cod = await PaymentGateway.findByOrFail("code", "cod");
        assert.isTrue(cod.enabled);

        const response = await client
            .patch(`/api/v1/admin/payment-gateways/${Number(cod.id)}`)
            .withGuard("api")
            .loginAs(admin)
            .json({ settings: { currency_display: "IRR" } });

        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const reloaded = await PaymentGateway.findOrFail(Number(cod.id));
        assert.isTrue(reloaded.enabled);
        assert.equal((reloaded.settings as Record<string, unknown>).currency_display, "IRR");
    });
});
