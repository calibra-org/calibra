import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import FoundationSeeder from "#database/seed_modules/0001_foundation_seeder";
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

const URL = "/api/v1/admin/settings/branding";

test.group("/api/v1/admin/settings/branding", (group) => {
    group.each.setup(async () => {
        await truncatePhase03Tables();
        const client = db.connection();
        await new FoundationSeeder(client).run();
        await new SettingsService().clearCache();
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

    test("admin GET returns branding with OKLCH palette defaults", async ({ client, assert }) => {
        const admin = await createAdmin();
        const res = await client.get(URL).withGuard("api").loginAs(admin);
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        const body = res.body() as {
            data: {
                font: string;
                logo: unknown;
                favicon: unknown;
                palette: { accent: string; background: string };
                options: { fonts: { value: string }[] };
            };
        };
        assert.equal(body.data.font, "vazirmatn");
        assert.isNull(body.data.logo);
        assert.isNull(body.data.favicon);
        assert.match(body.data.palette.accent, /^oklch\(/);
        assert.isAbove(body.data.options.fonts.length, 0);
    });

    test("admin PATCH persists changed keys and leaves the rest untouched", async ({ client, assert }) => {
        const admin = await createAdmin();
        const res = await client
            .patch(URL)
            .withGuard("api")
            .loginAs(admin)
            .json({ name: "Aurora", palette: { accent: "oklch(64% 0.16 45)" } });
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        const body = res.body() as { data: { name: string; tagline: string; palette: { accent: string; background: string } } };
        assert.equal(body.data.name, "Aurora");
        assert.equal(body.data.palette.accent, "oklch(64% 0.16 45)");
        assert.match(body.data.palette.background, /^oklch\(/);
    });

    test("same-value PATCH is a no-op (writes no audit row)", async ({ client, assert }) => {
        const admin = await createAdmin();
        await client.patch(URL).withGuard("api").loginAs(admin).json({ name: "Aurora" });
        const before = await AdminAuditLog.query().where("action", "settings.branding.patch").count("* as total");
        const res = await client.patch(URL).withGuard("api").loginAs(admin).json({ name: "Aurora" });
        res.assertStatus(200);
        const after = await AdminAuditLog.query().where("action", "settings.branding.patch").count("* as total");
        assert.equal(Number(after[0].$extras.total), Number(before[0].$extras.total));
    });

    test("PATCH rejects a non-OKLCH palette color", async ({ client }) => {
        const admin = await createAdmin();
        const res = await client
            .patch(URL)
            .withGuard("api")
            .loginAs(admin)
            .json({ palette: { accent: "#ff0000" } });
        res.assertStatus(422);
    });
});
