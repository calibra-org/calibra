import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import FoundationSeeder from "#database/seed_modules/0001_foundation_seeder";
import CurrenciesSeeder from "#database/seed_modules/0013_currencies_seeder";
import AdminAuditLog from "#models/admin_audit_log";
import Customer from "#models/customer";
import User from "#models/user";
import SettingsService from "#services/settings_service";
import { truncatePhase03Tables } from "#tests/helpers/db";

async function createAdmin() {
    const user = await User.create({ email: "admin@calibra.dev", passwordHash: "Passw0rd1!", role: "admin", locale: "fa" });
    await Customer.create({ userId: user.id, firstName: "Admin", lastName: "User", countryDefault: "IR", status: "active" });
    return user;
}

async function createCustomer() {
    return User.create({ email: "shopper@calibra.dev", passwordHash: "Passw0rd1!", role: "customer", locale: "fa" });
}

const URL = "/api/v1/admin/settings/general";

test.group("/api/v1/admin/settings/general + /api/v1/currency", (group) => {
    group.each.setup(async () => {
        await truncatePhase03Tables();
        const client = db.connection();
        await new FoundationSeeder(client).run();
        await new CurrenciesSeeder(client).run();
        await new SettingsService().clearCache();
    });

    test("public GET /currency returns the resolved display config", async ({ client, assert }) => {
        const res = await client.get("/api/v1/currency");
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        const body = res.body() as { data: { base: string; display: { code: string; base_ratio: number } } };
        assert.equal(body.data.base, "IRR");
        assert.equal(body.data.display.code, "IRT");
        assert.equal(body.data.display.base_ratio, 10);
    });

    test("admin GET requires authentication", async ({ client }) => {
        const res = await client.get(URL);
        res.assertStatus(401);
    });

    test("admin GET is forbidden for non-admins", async ({ client }) => {
        const user = await createCustomer();
        const res = await client.get(URL).withGuard("api").loginAs(user);
        res.assertStatus(403);
    });

    test("admin GET returns typed settings + option lists", async ({ client, assert }) => {
        const admin = await createAdmin();
        const res = await client.get(URL).withGuard("api").loginAs(admin);
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        const body = res.body() as {
            data: {
                currency: { base: string; display: string; position: string };
                options: { provinces: unknown[]; currencies: Array<{ code: string; enabled: boolean }> };
            };
        };
        assert.equal(body.data.currency.base, "IRR");
        assert.equal(body.data.currency.display, "IRT");
        assert.equal(body.data.options.provinces.length, 31);
        assert.isTrue(body.data.options.currencies.some((c) => c.code === "IRT" && c.enabled));
        assert.isTrue(body.data.options.currencies.some((c) => c.code === "USD" && !c.enabled));
    });

    test("admin PATCH persists changed keys and leaves the rest untouched", async ({ client, assert }) => {
        const admin = await createAdmin();
        const res = await client
            .patch(URL)
            .withGuard("api")
            .loginAs(admin)
            .json({ currency: { display: "IRR" }, store_address: { state: "IR-24", city: "تهران" } });
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        const body = res.body() as {
            data: { currency: { display: string; position: string }; store_address: { state: string; city: string } };
        };
        assert.equal(body.data.currency.display, "IRR");
        assert.equal(body.data.store_address.state, "IR-24");
        assert.equal(body.data.store_address.city, "تهران");
        assert.equal(body.data.currency.position, "right_space");
    });

    test("same-value PATCH is a no-op (writes no audit row)", async ({ client, assert }) => {
        const admin = await createAdmin();
        const before = await AdminAuditLog.query().where("action", "settings.general.patch").count("* as total");
        const res = await client
            .patch(URL)
            .withGuard("api")
            .loginAs(admin)
            .json({ taxes_and_coupons: { taxes_enabled: true } });
        res.assertStatus(200);
        const after = await AdminAuditLog.query().where("action", "settings.general.patch").count("* as total");
        assert.equal(Number(after[0].$extras.total), Number(before[0].$extras.total));
    });

    test("PATCH rejects equal thousand/decimal separators", async ({ client }) => {
        const admin = await createAdmin();
        const res = await client
            .patch(URL)
            .withGuard("api")
            .loginAs(admin)
            .json({ currency: { thousand_sep: ".", decimal_sep: "." } });
        res.assertStatus(422);
    });

    test("PATCH rejects a disabled display currency", async ({ client }) => {
        const admin = await createAdmin();
        const res = await client
            .patch(URL)
            .withGuard("api")
            .loginAs(admin)
            .json({ currency: { display: "USD" } });
        res.assertStatus(422);
    });

    test("PATCH rejects an unknown province for store state", async ({ client }) => {
        const admin = await createAdmin();
        const res = await client
            .patch(URL)
            .withGuard("api")
            .loginAs(admin)
            .json({ store_address: { state: "IR-99" } });
        res.assertStatus(422);
    });

    test("GET /currency reflects a display-currency PATCH after cache invalidation", async ({ client, assert }) => {
        const admin = await createAdmin();
        await client.get("/api/v1/currency");
        await client
            .patch(URL)
            .withGuard("api")
            .loginAs(admin)
            .json({ currency: { display: "IRR" } });
        const res = await client.get("/api/v1/currency");
        res.assertStatus(200);
        const body = res.body() as { data: { display: { code: string; base_ratio: number } } };
        assert.equal(body.data.display.code, "IRR");
        assert.equal(body.data.display.base_ratio, 1);
    });
});
