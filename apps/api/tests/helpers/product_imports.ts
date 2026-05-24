import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import db from "@adonisjs/lucid/services/db";

import User from "#models/user";

/**
 * Truncate everything the product importer can touch — own tables + product satellites — so
 * tests start clean. RESTART IDENTITY + CASCADE so id assertions stay stable and FK chains
 * resolve in one call.
 */
export async function truncateImportTables(): Promise<void> {
    const tables = [
        "product_import_changes",
        "product_import_errors",
        "product_imports",
        "product_import_mapping_presets",
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

/** Provision an admin user the importer endpoints will accept. */
export async function createImportAdmin(email: string = "importer-admin@calibra.dev"): Promise<User> {
    return User.create({
        email,
        passwordHash: "Passw0rd1!",
        role: "admin",
        locale: "fa",
    });
}

/**
 * Write a temporary CSV file to the OS temp directory and return its absolute path. Used by tests
 * that need a real on-disk file to hand to `.file("file", path)` via @japa/api-client's multipart
 * support. The temp dir is process-scoped so file names don't collide across parallel suites.
 */
export async function writeTempCsv(name: string, contents: string): Promise<string> {
    const dir = join(tmpdir(), "calibra-import-tests");
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${Date.now()}-${name}`);
    await writeFile(path, contents, "utf-8");
    return path;
}
