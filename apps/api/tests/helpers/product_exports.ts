import db from "@adonisjs/lucid/services/db";
import { DateTime } from "luxon";

import User from "#models/user";

/**
 * Reset the world for an export test: drops products + their satellites + exports + presets, then
 * lets the caller seed exactly what each test needs. RESTART IDENTITY keeps id assertions stable.
 */
export async function truncateExportTables(): Promise<void> {
    const tables = [
        "product_exports",
        "product_export_filter_presets",
        "product_translations",
        "product_category_links",
        "product_tag_links",
        "product_brand_links",
        "product_category_translations",
        "product_categories",
        "product_tag_translations",
        "product_tags",
        "product_brand_translations",
        "product_brands",
        "inventory_items",
        "products",
        "auth_access_tokens",
        "customers",
        "users",
    ];
    await db.rawQuery(`TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

export async function createExportAdmin(email = "export-admin@calibra.dev"): Promise<User> {
    return User.create({
        email,
        passwordHash: "Passw0rd1!",
        role: "admin",
        locale: "fa",
    });
}

/**
 * Seed a small product set with predictable shape so filter assertions stay stable. Inserts
 * three products: one published-simple, one draft-simple, one published-variable.
 */
export async function seedTestProducts(): Promise<void> {
    const now = DateTime.utc().toSQL();
    const rows = [
        {
            type: "simple",
            sku: "test-export-a",
            status: "publish",
            catalog_visibility: "visible",
            featured: true,
            virtual: false,
            downloadable: false,
            regular_price: 1_000_000,
            sale_price: null,
            tax_status: "taxable",
            sold_individually: false,
            reviews_allowed: true,
            menu_order: 0,
            attributes: {},
            created_at: now,
            updated_at: now,
        },
        {
            type: "simple",
            sku: "test-export-b",
            status: "draft",
            catalog_visibility: "visible",
            featured: false,
            virtual: false,
            downloadable: false,
            regular_price: 500_000,
            sale_price: 400_000,
            tax_status: "taxable",
            sold_individually: false,
            reviews_allowed: true,
            menu_order: 0,
            attributes: {},
            created_at: now,
            updated_at: now,
        },
        {
            type: "variable",
            sku: "test-export-c",
            status: "publish",
            catalog_visibility: "visible",
            featured: false,
            virtual: false,
            downloadable: false,
            regular_price: 2_000_000,
            sale_price: null,
            tax_status: "taxable",
            sold_individually: false,
            reviews_allowed: true,
            menu_order: 0,
            attributes: {},
            created_at: now,
            updated_at: now,
        },
    ];
    const inserted = await db.table("products").insert(rows).returning("id");
    for (const row of inserted as Array<{ id: number | bigint }>) {
        await db.table("product_translations").insert({
            product_id: Number(row.id),
            locale: "en",
            name: `Test product ${row.id}`,
            slug: `test-product-${row.id}`,
            description: null,
            short_description: null,
            purchase_note: null,
            external_button_text: null,
            created_at: now,
            updated_at: now,
        });
    }
}
