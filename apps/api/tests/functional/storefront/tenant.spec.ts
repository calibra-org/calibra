import cache from "@adonisjs/cache/services/main";
import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";
import { DateTime } from "luxon";

import SettingsService from "#services/settings_service";
import { runInTestTenant, TEST_TENANT_ID, TEST_TENANT_SLUG } from "#tests/helpers/tenant";

/** A reserved id distinct from every other spec's extra tenant. */
const SUSPENDED_TENANT_ID = 100_078;
const SUSPENDED_TENANT_SLUG = "storefront-suspended";

interface TenantBody {
    data: {
        slug: string;
        name: string;
        template_key: string;
        status: string;
        currency: string;
        branding: {
            name: string;
            tagline: string;
            font: string;
            logoUrl: string | null;
            faviconUrl: string | null;
            palette: Record<string, string>;
        };
    };
}

async function ensureSuspendedTenant(): Promise<void> {
    const admin = db.connection("postgres_admin");
    const now = DateTime.utc().toSQL()!;
    const plan = await admin.from("plans").where("key", "starter").firstOrFail();
    await admin
        .table("tenants")
        .insert({
            id: SUSPENDED_TENANT_ID,
            slug: SUSPENDED_TENANT_SLUG,
            name: "Suspended Shop",
            status: "suspended",
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

test.group("Storefront tenant — profile + branding", (group) => {
    group.each.setup(async () => {
        /** Start every test from a clean branding slate + cold cache. */
        await db
            .connection("postgres_admin")
            .from("settings")
            .where("tenant_id", TEST_TENANT_ID)
            .where("group_key", "branding")
            .delete();
        await cache.clear();
    });

    group.teardown(async () => {
        await cache.clear();
        await db.connection("postgres_admin").from("tenants").where("id", SUSPENDED_TENANT_ID).delete();
    });

    test("returns the resolved tenant profile + default branding", async ({ client, assert }) => {
        const res = await client.get("/api/v1/storefront/tenant");
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        const body = res.body() as TenantBody;
        assert.equal(body.data.slug, TEST_TENANT_SLUG);
        assert.equal(body.data.template_key, "default");
        assert.equal(body.data.status, "active");
        assert.equal(body.data.currency, "IRR");
        /** No branding rows → name falls back to the tenant name, palette to the defaults. */
        assert.equal(body.data.branding.name, "Test Shop");
        assert.equal(body.data.branding.logoUrl, null);
        assert.properties(body.data.branding.palette, [
            "background",
            "foreground",
            "muted",
            "mutedForeground",
            "border",
            "accent",
            "accentForeground",
        ]);
        assert.match(body.data.branding.palette.accent, /^oklch\(/);
    });

    test("surfaces operator-set branding overrides", async ({ client, assert }) => {
        await runInTestTenant(async () => {
            const settings = new SettingsService();
            await settings.set("branding", "name", "Aurora Test", "string");
            await settings.set("branding", "tagline", "Bright essentials", "string");
            await settings.set("branding", "palette_accent", "oklch(64% 0.16 45)", "string");
        });
        await cache.clear();

        const res = await client.get("/api/v1/storefront/tenant");
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        const body = res.body() as TenantBody;
        assert.equal(body.data.branding.name, "Aurora Test");
        assert.equal(body.data.branding.tagline, "Bright essentials");
        assert.equal(body.data.branding.palette.accent, "oklch(64% 0.16 45)");
    });

    test("404 when the tenant reference is unknown", async ({ client }) => {
        const res = await client.get("/api/v1/storefront/tenant").header("X-Calibra-Tenant", "no-such-shop-xyz");
        res.assertStatus(404);
    });

    test("503 when the resolved tenant is suspended", async ({ client }) => {
        await ensureSuspendedTenant();
        const res = await client.get("/api/v1/storefront/tenant").header("X-Calibra-Tenant", SUSPENDED_TENANT_SLUG);
        res.assertStatus(503);
    });
});
