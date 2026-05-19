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

    test("admin GET lists all gateways with sensitive setting keys masked", async ({ client, assert }) => {
        const admin = await createAdmin();
        const response = await client.get("/api/v1/admin/payment-gateways").withGuard("api").loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const list = response.body().data as Array<{ code: string; settings: Record<string, string> }>;
        const zarinpal = list.find((g) => g.code === "zarinpal")!;
        assert.equal(zarinpal.settings.merchant_id, "***");
    });

    test("PATCH updates enabled + merges settings; sensitive keys still mask on the response", async ({ client, assert }) => {
        const admin = await createAdmin();
        const idpay = await PaymentGateway.findByOrFail("code", "idpay");

        const response = await client
            .patch(`/api/v1/admin/payment-gateways/${Number(idpay.id)}`)
            .withGuard("api")
            .loginAs(admin)
            .json({ enabled: true, settings: { api_key: "NEWKEY", currency_display: "IRT" } });

        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body().data as { enabled: boolean; settings: Record<string, string> };
        assert.isTrue(body.enabled);
        assert.equal(body.settings.api_key, "***");
        assert.equal(body.settings.currency_display, "IRT");

        const reloaded = await PaymentGateway.findOrFail(Number(idpay.id));
        const settings = reloaded.settings as Record<string, unknown>;
        assert.equal(settings.api_key, "NEWKEY");
        assert.equal(settings.currency_display, "IRT");
    });
});
