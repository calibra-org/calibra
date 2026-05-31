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

const URL = "/api/v1/admin/settings/media";

test.group("/api/v1/admin/settings/media", (group) => {
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

    test("admin GET returns image-size presets + upload options", async ({ client, assert }) => {
        const admin = await createAdmin();
        const res = await client.get(URL).withGuard("api").loginAs(admin);
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        const body = res.body() as {
            data: {
                thumbnail: { width: number; height: number; crop: boolean };
                large: { width: number; height: number };
                uploads: { organize_by_date: boolean; max_upload_mb: number };
            };
        };
        assert.equal(body.data.thumbnail.width, 150);
        assert.equal(body.data.thumbnail.crop, true);
        assert.equal(body.data.large.width, 1024);
        assert.equal(body.data.uploads.organize_by_date, true);
        assert.equal(body.data.uploads.max_upload_mb, 20);
    });

    test("admin PATCH persists changed keys and leaves the rest untouched", async ({ client, assert }) => {
        const admin = await createAdmin();
        const res = await client
            .patch(URL)
            .withGuard("api")
            .loginAs(admin)
            .json({ thumbnail: { width: 200, crop: false }, uploads: { organize_by_date: false } });
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        const body = res.body() as {
            data: { thumbnail: { width: number; height: number; crop: boolean }; uploads: { organize_by_date: boolean } };
        };
        assert.equal(body.data.thumbnail.width, 200);
        assert.equal(body.data.thumbnail.crop, false);
        assert.equal(body.data.thumbnail.height, 150);
        assert.equal(body.data.uploads.organize_by_date, false);
    });

    test("same-value PATCH is a no-op (writes no audit row)", async ({ client, assert }) => {
        const admin = await createAdmin();
        const before = await AdminAuditLog.query().where("action", "settings.media.patch").count("* as total");
        const res = await client.patch(URL).withGuard("api").loginAs(admin).json({ thumbnail: { width: 150 } });
        res.assertStatus(200);
        const after = await AdminAuditLog.query().where("action", "settings.media.patch").count("* as total");
        assert.equal(Number(after[0].$extras.total), Number(before[0].$extras.total));
    });

    test("PATCH rejects an out-of-range dimension", async ({ client }) => {
        const admin = await createAdmin();
        const res = await client.patch(URL).withGuard("api").loginAs(admin).json({ thumbnail: { width: 99999 } });
        res.assertStatus(422);
    });
});
