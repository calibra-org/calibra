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

const URL = "/api/v1/admin/settings/datetime";

test.group("/api/v1/admin/settings/datetime", (group) => {
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

    test("admin GET returns active formats + preset lists", async ({ client, assert }) => {
        const admin = await createAdmin();
        const res = await client.get(URL).withGuard("api").loginAs(admin);
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        const body = res.body() as {
            data: {
                date_format: string;
                time_format: string;
                presets: { date: Array<{ pattern: string; label_key: string }>; time: unknown[] };
            };
        };
        assert.equal(body.data.date_format, "d MMMM yyyy");
        assert.equal(body.data.time_format, "HH:mm");
        assert.lengthOf(body.data.presets.date, 5);
        assert.lengthOf(body.data.presets.time, 3);
        assert.isTrue(body.data.presets.date.some((p) => p.pattern === "yyyy-MM-dd"));
    });

    test("admin PATCH persists a changed format", async ({ client, assert }) => {
        const admin = await createAdmin();
        const res = await client.patch(URL).withGuard("api").loginAs(admin).json({ date_format: "yyyy-MM-dd" });
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        const body = res.body() as { data: { date_format: string; time_format: string } };
        assert.equal(body.data.date_format, "yyyy-MM-dd");
        assert.equal(body.data.time_format, "HH:mm");
    });

    test("same-value PATCH is a no-op (writes no audit row)", async ({ client, assert }) => {
        const admin = await createAdmin();
        const before = await AdminAuditLog.query().where("action", "settings.datetime.patch").count("* as total");
        const res = await client.patch(URL).withGuard("api").loginAs(admin).json({ date_format: "d MMMM yyyy" });
        res.assertStatus(200);
        const after = await AdminAuditLog.query().where("action", "settings.datetime.patch").count("* as total");
        assert.equal(Number(after[0].$extras.total), Number(before[0].$extras.total));
    });

    test("PATCH rejects an invalid format pattern", async ({ client }) => {
        const admin = await createAdmin();
        const res = await client.patch(URL).withGuard("api").loginAs(admin).json({ date_format: "YYYY!bad" });
        res.assertStatus(422);
    });

    test("PATCH rejects time tokens in the date format", async ({ client }) => {
        const admin = await createAdmin();
        const res = await client.patch(URL).withGuard("api").loginAs(admin).json({ date_format: "HH:mm" });
        res.assertStatus(422);
    });

    test("PATCH rejects date tokens in the time format", async ({ client }) => {
        const admin = await createAdmin();
        const res = await client.patch(URL).withGuard("api").loginAs(admin).json({ time_format: "yyyy/MM/dd" });
        res.assertStatus(422);
    });

    test("PATCH accepts a valid custom time format", async ({ client, assert }) => {
        const admin = await createAdmin();
        const res = await client.patch(URL).withGuard("api").loginAs(admin).json({ time_format: "h:mm a" });
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        const body = res.body() as { data: { time_format: string } };
        assert.equal(body.data.time_format, "h:mm a");
    });
});
