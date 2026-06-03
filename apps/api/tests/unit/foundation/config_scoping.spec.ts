import cache from "@adonisjs/cache/services/main";
import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";
import { DateTime } from "luxon";

import { resolveCurrencyConfig } from "#services/currency_config_service";
import { bootstrapRoles } from "#services/db_roles";
import SettingsService from "#services/settings_service";
import { resolveSmsFrom } from "#services/sms/sms_sender";
import { runWithTenant } from "#services/tenant_context";
import env from "#start/env";
import { runInTestTenant, TEST_TENANT_ID } from "#tests/helpers/tenant";

test.group("Config scoping — per-tenant SMS sender", (group) => {
    group.each.setup(async () => {
        await cache.clear();
        await db
            .connection("postgres_admin")
            .from("settings")
            .where("tenant_id", TEST_TENANT_ID)
            .where("group_key", "sms")
            .delete();
    });

    test("resolveSmsFrom returns the tenant's sms.from_number setting", async ({ assert }) => {
        const from = await runInTestTenant(async () => {
            await new SettingsService().set("sms", "from_number", "98500012345", "string");
            return resolveSmsFrom();
        });
        assert.equal(from, "98500012345");
    });

    test("resolveSmsFrom falls back to SMS_FROM env when the setting is empty", async ({ assert }) => {
        const from = await runInTestTenant(async () => {
            await new SettingsService().set("sms", "from_number", "", "string");
            return resolveSmsFrom();
        });
        /** `.env.test` does not set SMS_FROM, so the fallback is null. */
        assert.isNull(from);
    });
});

/**
 * Resolves on the runtime role `calibra_app` (NOBYPASSRLS), not the suite superuser: the superuser
 * bypasses RLS, so `SettingsService.all("general")` would read *every* tenant's `general` rows and a
 * stray `currency` setting from another tenant could mask the row-level fallback. On `calibra_app`
 * the read is RLS-scoped to the EUR tenant (which has no `general` settings), so resolution falls
 * through to the tenant row's `currency_code` — the behaviour under test.
 */
test.group("Config scoping — per-tenant currency", (group) => {
    const EUR_TENANT = 900_041;
    const APP_CONNECTION = "config_scoping_app";

    group.setup(async () => {
        const su = db.connection();
        await bootstrapRoles(su, {
            appUser: "calibra_app",
            appPassword: "calibra_app",
            adminUser: "calibra_admin",
            adminPassword: "calibra_admin",
        });
        const now = DateTime.utc().toSQL()!;
        /** The tenant's currency_code FKs `currencies.code`; seed a EUR row (distinct from the IRR fallback). */
        await su
            .table("currencies")
            .insert({
                code: "EUR",
                symbol: "€",
                name_en: "Euro",
                name_fa: "یورو",
                base_ratio: 600_000,
                enabled: true,
                created_at: now,
                updated_at: now,
            })
            .onConflict("code")
            .ignore();
        const plan = await su.from("plans").where("key", "starter").first();
        await su
            .table("tenants")
            .insert({
                id: EUR_TENANT,
                slug: "eur-shop",
                name: "EUR Shop",
                status: "active",
                plan_id: plan ? Number(plan.id) : 1,
                db_tier: "shared",
                template_key: "default",
                currency_code: "EUR",
                primary_locale: "fa",
                created_at: now,
                updated_at: now,
            })
            .onConflict("id")
            .ignore();

        db.manager.add(APP_CONNECTION, {
            client: "pg",
            connection: {
                host: env.get("DB_HOST"),
                port: env.get("DB_PORT"),
                user: "calibra_app",
                password: "calibra_app",
                database: env.get("DB_DATABASE"),
            },
        });

        return async () => {
            await db.manager.close(APP_CONNECTION, true);
            await su.from("tenants").where("id", EUR_TENANT).delete();
            await su.from("currencies").where("code", "EUR").delete();
        };
    });

    test("resolveCurrencyConfig falls back to the active tenant's currency_code", async ({ assert }) => {
        await cache.clear();
        const config = await db.connection(APP_CONNECTION).transaction(async (trx) => {
            await trx.rawQuery("SELECT set_config('app.current_tenant', ?, true)", [String(EUR_TENANT)]);
            return runWithTenant(BigInt(EUR_TENANT), trx, () => resolveCurrencyConfig());
        });
        /** EUR is the tenant row's currency_code, distinct from the hardcoded "IRR" fallback. */
        assert.equal(config.baseCode, "EUR");
    });
});
