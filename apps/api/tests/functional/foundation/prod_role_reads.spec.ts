import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";
import { DateTime } from "luxon";

import { bootstrapRoles } from "#services/db_roles";
import env from "#start/env";

/**
 * Proves the Phase-2 direct-`db` → `currentTrx()`/model conversions are sound at the production
 * posture. Each converted read (admin orders count, catalog slug→id resolution, inventory variation
 * lookup, admin media months) now rides the GUC-bearing request/job transaction instead of a bare
 * pooled connection. This spec exercises the underlying guarantee on the runtime role `calibra_app`
 * (NOBYPASSRLS): a query scoped to tenant A returns A's rows, and a query scoped to a tenant with no
 * such rows returns ZERO — exactly the fail-closed behaviour a context-less pool query would have
 * produced for EVERY tenant before the conversion.
 */
const APP_CONNECTION = "prod_role_reads_app";
const TENANT_A = 900_031;
const TENANT_B = 900_032;
const SLUG = "prod-role-scoped-slug";

async function seedTenant(su: ReturnType<typeof db.connection>, id: number, slug: string, now: string): Promise<void> {
    const plan = await su.from("plans").where("key", "starter").firstOrFail();
    await su
        .table("tenants")
        .insert({
            id,
            slug,
            name: slug,
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

test.group("prod-role reads of converted paths (calibra_app)", (group) => {
    group.setup(async () => {
        const su = db.connection();
        await bootstrapRoles(su, {
            appUser: "calibra_app",
            appPassword: "calibra_app",
            adminUser: "calibra_admin",
            adminPassword: "calibra_admin",
        });
        const now = DateTime.utc().toSQL()!;
        await su
            .table("plans")
            .insert({ key: "starter", name: "Starter", db_tier: "shared", is_default: true, created_at: now, updated_at: now })
            .onConflict("key")
            .ignore();
        await seedTenant(su, TENANT_A, "prod-a", now);
        await seedTenant(su, TENANT_B, "prod-b", now);

        /** Tenant A gets one of every converted-path row; tenant B gets none. */
        const product = (await su
            .table("products")
            .insert({ tenant_id: TENANT_A, created_at: now, updated_at: now })
            .returning("id")) as Array<{ id: number | string }>;
        const productId = Number(product[0].id);
        await su.table("product_translations").insert({
            tenant_id: TENANT_A,
            product_id: productId,
            locale: "en",
            name: "Scoped",
            slug: SLUG,
            created_at: now,
            updated_at: now,
        });
        await su
            .table("product_variations")
            .insert({ tenant_id: TENANT_A, product_id: productId, created_at: now, updated_at: now });
        const orderRows = (await su
            .table("orders")
            .insert({ tenant_id: TENANT_A, order_number: 100_500, created_at: now, updated_at: now })
            .returning("id")) as Array<{ id: number | string }>;
        /** order_addresses powers the regional dashboard join (orders → order_addresses → regions). */
        await su.table("order_addresses").insert({
            tenant_id: TENANT_A,
            order_id: Number(orderRows[0].id),
            kind: "shipping",
            first_name: "Scoped",
            last_name: "Shipping",
            address_line_1: "خیابان آزادی",
            city: "تهران",
            postcode: "1234567890",
            country: "IR",
            attributes: JSON.stringify({}),
            created_at: now,
            updated_at: now,
        });
        /** A customer user + favourite + category link — the exact bare-db tables that crashed/zeroed. */
        const favUser = (await su
            .table("users")
            .insert({
                tenant_id: TENANT_A,
                email: "prod-fav@a.test",
                password_hash: "x",
                role: "customer",
                locale: "fa",
                created_at: now,
                updated_at: now,
            })
            .returning("id")) as Array<{ id: number | string }>;
        await su
            .table("product_favorites")
            .insert({ tenant_id: TENANT_A, user_id: Number(favUser[0].id), product_id: productId, created_at: now });
        const cat = (await su
            .table("product_categories")
            .insert({ tenant_id: TENANT_A, created_at: now, updated_at: now })
            .returning("id")) as Array<{ id: number | string }>;
        await su.table("product_category_links").insert({
            tenant_id: TENANT_A,
            product_id: productId,
            category_id: Number(cat[0].id),
            created_at: now,
            updated_at: now,
        });
        await su.table("media").insert({
            tenant_id: TENANT_A,
            kind: "image",
            url: `http://localhost/uploads/t${TENANT_A}/x.jpg`,
            filename: "x.jpg",
            attributes: JSON.stringify({}),
            created_at: now,
            updated_at: now,
        });

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
            const cleanup = db.connection();
            await cleanup.from("order_addresses").whereIn("tenant_id", [TENANT_A, TENANT_B]).delete();
            await cleanup.from("orders").whereIn("tenant_id", [TENANT_A, TENANT_B]).delete();
            await cleanup.from("product_favorites").whereIn("tenant_id", [TENANT_A, TENANT_B]).delete();
            await cleanup.from("product_category_links").whereIn("tenant_id", [TENANT_A, TENANT_B]).delete();
            await cleanup.from("product_categories").whereIn("tenant_id", [TENANT_A, TENANT_B]).delete();
            await cleanup.from("product_variations").whereIn("tenant_id", [TENANT_A, TENANT_B]).delete();
            await cleanup.from("product_translations").whereIn("tenant_id", [TENANT_A, TENANT_B]).delete();
            await cleanup.from("products").whereIn("tenant_id", [TENANT_A, TENANT_B]).delete();
            await cleanup.from("media").whereIn("tenant_id", [TENANT_A, TENANT_B]).delete();
            await cleanup.from("users").whereIn("tenant_id", [TENANT_A, TENANT_B]).delete();
            await cleanup.from("tenants").whereIn("id", [TENANT_A, TENANT_B]).delete();
        };
    });

    /** Run `sql` on calibra_app inside a transaction scoped to `tenantId`; returns the first row's `count`. */
    async function scopedCount(tenantId: number, sql: string): Promise<number> {
        const app = db.connection(APP_CONNECTION);
        return app.transaction(async (trx) => {
            await trx.rawQuery("SELECT set_config('app.current_tenant', ?, true)", [String(tenantId)]);
            const res = await trx.rawQuery(sql);
            return Number((res.rows[0] as { count: number }).count);
        });
    }

    test("orders count is tenant-scoped (orders_controller.counts)", async ({ assert }) => {
        const sql = "SELECT count(*)::int AS count FROM orders WHERE deleted_at IS NULL";
        assert.equal(await scopedCount(TENANT_A, sql), 1);
        assert.equal(await scopedCount(TENANT_B, sql), 0);
    });

    test("slug→id resolution is tenant-scoped (catalog products resolveSlugsToIds)", async ({ assert }) => {
        const sql = `SELECT count(*)::int AS count FROM product_translations WHERE locale = 'en' AND slug = '${SLUG}'`;
        assert.equal(await scopedCount(TENANT_A, sql), 1);
        assert.equal(await scopedCount(TENANT_B, sql), 0);
    });

    test("variation lookup is tenant-scoped (inventory_service.resolveItem)", async ({ assert }) => {
        const sql = "SELECT count(*)::int AS count FROM product_variations";
        assert.equal(await scopedCount(TENANT_A, sql), 1);
        assert.equal(await scopedCount(TENANT_B, sql), 0);
    });

    test("media months scan is tenant-scoped (media_controller.months)", async ({ assert }) => {
        const sql = "SELECT count(DISTINCT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM'))::int AS count FROM media";
        assert.equal(await scopedCount(TENANT_A, sql), 1);
        assert.equal(await scopedCount(TENANT_B, sql), 0);
    });

    test("product_favorites is tenant-scoped (products_controller favourites)", async ({ assert }) => {
        const sql = "SELECT count(*)::int AS count FROM product_favorites";
        assert.equal(await scopedCount(TENANT_A, sql), 1);
        assert.equal(await scopedCount(TENANT_B, sql), 0);
    });

    test("product_category_links is tenant-scoped (products_controller facet counts)", async ({ assert }) => {
        const sql = "SELECT count(*)::int AS count FROM product_category_links";
        assert.equal(await scopedCount(TENANT_A, sql), 1);
        assert.equal(await scopedCount(TENANT_B, sql), 0);
    });

    test("order_addresses join is tenant-scoped (regional insights aggregation)", async ({ assert }) => {
        const sql =
            "SELECT count(*)::int AS count FROM order_addresses oa JOIN orders o ON o.id = oa.order_id WHERE oa.kind = 'shipping'";
        assert.equal(await scopedCount(TENANT_A, sql), 1);
        assert.equal(await scopedCount(TENANT_B, sql), 0);
    });
});
