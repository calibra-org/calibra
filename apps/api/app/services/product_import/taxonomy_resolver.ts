import type { TransactionClientContract } from "@adonisjs/lucid/types/database";
import { DateTime } from "luxon";

import { slugify } from "#services/slug_service";

/**
 * Taxonomy lookup + auto-create helpers used by the runner. The importer needs to:
 *
 * - Resolve category paths like `"Footwear > Sneakers > Casual"` into category ids, creating
 *   missing levels as it goes.
 * - Resolve free-text tag names into tag ids, creating missing tags.
 * - Resolve a single brand name into a brand id, creating it if missing.
 * - Look up an optional tax-class slug (no auto-create — unknown tax_class is an error row).
 *
 * All helpers consume the active transaction so they roll back cleanly when a chunk errors.
 * `createdCounter` tracks how many *new* rows were inserted so the runner can show "X new
 * categories created" in the Step 4 summary.
 */

export interface NewRowCounters {
    categoriesCreated: number;
    tagsCreated: number;
    brandsCreated: number;
}

export function newCounters(): NewRowCounters {
    return { categoriesCreated: 0, tagsCreated: 0, brandsCreated: 0 };
}

/**
 * Resolve a `"A > B > C"` path into a category id at the leaf, creating each segment that doesn't
 * already exist under its parent. Lookups are case-insensitive within (parent_id, locale).
 */
export async function resolveCategoryPath(
    trx: TransactionClientContract,
    rawPath: string,
    locale: string,
    counters: NewRowCounters,
): Promise<number> {
    const segments = rawPath
        .split(">")
        .map((s) => s.trim())
        .filter((s) => s !== "");
    if (segments.length === 0) throw new Error("empty_category_path");

    let parentId: number | null = null;
    for (const segment of segments) {
        const id = await resolveCategorySegment(trx, segment, parentId, locale, counters);
        parentId = id;
    }
    return parentId!;
}

async function resolveCategorySegment(
    trx: TransactionClientContract,
    name: string,
    parentId: number | null,
    locale: string,
    counters: NewRowCounters,
): Promise<number> {
    const existing = await findCategoryByName(trx, name, parentId, locale);
    if (existing !== null) return existing;
    return createCategory(trx, name, parentId, locale, counters);
}

async function findCategoryByName(
    trx: TransactionClientContract,
    name: string,
    parentId: number | null,
    locale: string,
): Promise<number | null> {
    const query = trx
        .from("product_categories as c")
        .innerJoin("product_category_translations as ct", "ct.category_id", "c.id")
        .where("ct.locale", locale)
        .whereRaw("LOWER(ct.name) = LOWER(?)", [name])
        .select("c.id");
    if (parentId === null) query.whereNull("c.parent_id");
    else query.where("c.parent_id", parentId);
    const row = await query.first();
    if (!row) return null;
    return Number((row as { id: number | bigint }).id);
}

async function createCategory(
    trx: TransactionClientContract,
    name: string,
    parentId: number | null,
    locale: string,
    counters: NewRowCounters,
): Promise<number> {
    const now = DateTime.utc().toSQL();
    const [inserted] = await trx
        .table("product_categories")
        .insert({
            parent_id: parentId,
            menu_order: 0,
            created_at: now,
            updated_at: now,
        })
        .returning("id");
    const id = Number((inserted as { id: number | bigint }).id);
    const slug = `${slugify(name, locale === "fa" ? "fa" : "en")}-${id}`;
    await trx.table("product_category_translations").insert({
        category_id: id,
        locale,
        name,
        slug,
        description: null,
        created_at: now,
        updated_at: now,
    });
    counters.categoriesCreated++;
    return id;
}

/**
 * Resolve a list of tag display names to tag ids, creating any that don't yet exist for the given
 * locale. Returns ids in input order.
 */
export async function resolveTags(
    trx: TransactionClientContract,
    names: string[],
    locale: string,
    counters: NewRowCounters,
): Promise<number[]> {
    const ids: number[] = [];
    for (const rawName of names) {
        const name = rawName.trim();
        if (name === "") continue;
        const existing = await findTagByName(trx, name, locale);
        if (existing !== null) {
            ids.push(existing);
            continue;
        }
        ids.push(await createTag(trx, name, locale, counters));
    }
    return ids;
}

async function findTagByName(trx: TransactionClientContract, name: string, locale: string): Promise<number | null> {
    const row = await trx
        .from("product_tags as t")
        .innerJoin("product_tag_translations as tt", "tt.tag_id", "t.id")
        .where("tt.locale", locale)
        .whereRaw("LOWER(tt.name) = LOWER(?)", [name])
        .select("t.id")
        .first();
    if (!row) return null;
    return Number((row as { id: number | bigint }).id);
}

async function createTag(
    trx: TransactionClientContract,
    name: string,
    locale: string,
    counters: NewRowCounters,
): Promise<number> {
    const now = DateTime.utc().toSQL();
    const [inserted] = await trx.table("product_tags").insert({ created_at: now, updated_at: now }).returning("id");
    const id = Number((inserted as { id: number | bigint }).id);
    const slug = `${slugify(name, locale === "fa" ? "fa" : "en")}-${id}`;
    await trx.table("product_tag_translations").insert({
        tag_id: id,
        locale,
        name,
        slug,
        description: null,
        created_at: now,
        updated_at: now,
    });
    counters.tagsCreated++;
    return id;
}

/** Resolve a single brand name to a brand id, creating it if missing. */
export async function resolveBrand(
    trx: TransactionClientContract,
    rawName: string,
    locale: string,
    counters: NewRowCounters,
): Promise<number | null> {
    const name = rawName.trim();
    if (name === "") return null;
    const row = await trx
        .from("product_brands as b")
        .innerJoin("product_brand_translations as bt", "bt.brand_id", "b.id")
        .where("bt.locale", locale)
        .whereRaw("LOWER(bt.name) = LOWER(?)", [name])
        .select("b.id")
        .first();
    if (row) return Number((row as { id: number | bigint }).id);

    const now = DateTime.utc().toSQL();
    const [inserted] = await trx.table("product_brands").insert({ created_at: now, updated_at: now }).returning("id");
    const id = Number((inserted as { id: number | bigint }).id);
    const slug = `${slugify(name, locale === "fa" ? "fa" : "en")}-${id}`;
    await trx.table("product_brand_translations").insert({
        brand_id: id,
        locale,
        name,
        slug,
        description: null,
        created_at: now,
        updated_at: now,
    });
    counters.brandsCreated++;
    return id;
}

/**
 * Look up tax_class by code/slug. Returns `null` when not found — the runner emits
 * `unknown_tax_class` so the operator knows to create the class first or fix the spreadsheet.
 */
export async function resolveTaxClass(
    trx: TransactionClientContract,
    rawSlug: string,
): Promise<number | null> {
    const slug = rawSlug.trim().toLowerCase();
    if (slug === "") return null;
    const row = await trx.from("tax_classes").whereRaw("LOWER(slug) = ?", [slug]).select("id").first();
    if (!row) return null;
    return Number((row as { id: number | bigint }).id);
}
