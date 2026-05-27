import db from "@adonisjs/lucid/services/db";
import type { TransactionClientContract } from "@adonisjs/lucid/types/database";
import { DateTime } from "luxon";

import { slugify } from "#services/slug_service";

export interface TranslationInput {
    locale: string;
    name: string;
    slug?: string | null;
    description?: string | null;
    short_description?: string | null;
    purchase_note?: string | null;
    external_button_text?: string | null;
}

/**
 * Write/replace translation rows for a translatable parent. `parentColumn` is the FK column on the
 * translation table (e.g. `product_id`). Deletes nothing — `updateOrInsert` upserts based on
 * `(parentColumn, locale)`. Caller passes the active transaction.
 */
export async function upsertTranslations(
    trx: TransactionClientContract,
    table: string,
    parentColumn: string,
    parentId: bigint | number,
    rows: TranslationInput[],
    fields: Array<"name" | "slug" | "description" | "short_description" | "purchase_note" | "external_button_text">,
): Promise<void> {
    if (rows.length === 0) return;
    const now = DateTime.utc().toSQL();
    const records = rows.map((row) => {
        const record: Record<string, unknown> = {
            [parentColumn]: parentId,
            locale: row.locale,
            created_at: now,
            updated_at: now,
        };
        for (const field of fields) {
            if (field === "name") {
                record.name = row.name;
            } else if (field === "slug") {
                const baseSlug = row.slug ?? slugify(row.name, row.locale === "fa" ? "fa" : "en");
                record.slug = baseSlug;
            } else if (field === "description") {
                record.description = row.description ?? null;
            } else if (field === "short_description") {
                record.short_description = row.short_description ?? null;
            } else if (field === "purchase_note") {
                record.purchase_note = row.purchase_note ?? null;
            } else if (field === "external_button_text") {
                record.external_button_text = row.external_button_text ?? null;
            }
        }
        return record;
    });

    const mergeColumns = fields.filter((f) => f !== "slug" || true).concat(["updated_at" as never]) as string[];

    await trx.table(table).insert(records).onConflict([parentColumn, "locale"]).merge(mergeColumns);
}

/** Drop and reinsert link rows for a many-to-many pivot. No-ops when ids is undefined. */
export async function syncLinks(
    trx: TransactionClientContract,
    table: string,
    parentColumn: string,
    parentId: bigint | number,
    childColumn: string,
    ids: number[] | undefined,
): Promise<void> {
    if (ids === undefined) return;
    await trx.from(table).where(parentColumn, String(parentId)).delete();
    if (ids.length === 0) return;
    const now = DateTime.utc().toSQL();
    await trx.table(table).insert(
        ids.map((id) => ({
            [parentColumn]: parentId,
            [childColumn]: id,
            created_at: now,
            updated_at: now,
        })),
    );
}

/**
 * Drop and reinsert position-aware many-to-many rows (upsells / cross-sells / grouped members).
 * Order in the `ids` array becomes the `position` value, so the storefront list/card grid renders
 * in the operator's chosen sequence. No-ops when `ids` is undefined.
 */
export async function syncOrderedLinks(
    trx: TransactionClientContract,
    table: string,
    parentColumn: string,
    parentId: bigint | number,
    childColumn: string,
    ids: number[] | undefined,
): Promise<void> {
    if (ids === undefined) return;
    await trx.from(table).where(parentColumn, String(parentId)).delete();
    if (ids.length === 0) return;
    const now = DateTime.utc().toSQL();
    await trx.table(table).insert(
        ids.map((id, position) => ({
            [parentColumn]: parentId,
            [childColumn]: id,
            position,
            created_at: now,
            updated_at: now,
        })),
    );
}

export interface DownloadInput {
    id?: number;
    media_id: number;
    file_label: string;
    download_limit?: number | null;
    download_expiry_days?: number | null;
    position?: number;
}

/**
 * Replace `product_downloads` rows for a product. Replace-all semantics: any row whose id is not
 * in the inbound list is deleted; rows with no id are inserted; rows with an id are updated
 * in-place. Position falls back to the array index when not provided.
 */
export async function syncProductDownloads(
    trx: TransactionClientContract,
    productId: bigint | number,
    downloads: DownloadInput[] | undefined,
): Promise<void> {
    if (downloads === undefined) return;
    const now = DateTime.utc().toSQL();
    const keepIds = downloads.map((d) => d.id).filter((id): id is number => typeof id === "number" && Number.isFinite(id));
    if (keepIds.length === 0) {
        await trx.from("product_downloads").where("product_id", String(productId)).delete();
    } else {
        await trx.from("product_downloads").where("product_id", String(productId)).whereNotIn("id", keepIds).delete();
    }
    let index = 0;
    for (const row of downloads) {
        const position = row.position ?? index;
        if (typeof row.id === "number" && Number.isFinite(row.id)) {
            await trx
                .from("product_downloads")
                .where("id", row.id)
                .where("product_id", String(productId))
                .update({
                    media_id: row.media_id,
                    file_label: row.file_label,
                    download_limit: row.download_limit ?? null,
                    download_expiry_days: row.download_expiry_days ?? null,
                    position,
                    updated_at: now,
                });
        } else {
            await trx.table("product_downloads").insert({
                product_id: productId,
                media_id: row.media_id,
                file_label: row.file_label,
                download_limit: row.download_limit ?? null,
                download_expiry_days: row.download_expiry_days ?? null,
                position,
                created_at: now,
                updated_at: now,
            });
        }
        index += 1;
    }
}

export interface AttributeLinkInput {
    attribute_id: number;
    position?: number;
    visible?: boolean;
    used_for_variation?: boolean;
    /**
     * Customer-facing display type for the choice. Defaults to `dropdown` so unmigrated payloads
     * keep working. The four enum values match the DB CHECK and the OpenAPI schema.
     */
    display_type?: "dropdown" | "pills" | "color_swatch" | "image_swatch";
    term_ids: number[];
}

/**
 * Replace-all sync for the `product_attribute_links` table + its `product_attribute_link_terms`
 * children. Inbound `term_ids` must already belong to the linked attribute — the caller is
 * responsible for that check (validator-side). Order in the array becomes `position`. No-ops
 * when `links` is undefined.
 */
export async function syncProductAttributeLinks(
    trx: TransactionClientContract,
    productId: bigint | number,
    links: AttributeLinkInput[] | undefined,
): Promise<void> {
    if (links === undefined) return;
    const now = DateTime.utc().toSQL();
    await trx
        .from("product_attribute_link_terms")
        .whereIn("link_id", trx.from("product_attribute_links").where("product_id", String(productId)).select("id"))
        .delete();
    await trx.from("product_attribute_links").where("product_id", String(productId)).delete();
    if (links.length === 0) return;
    for (let i = 0; i < links.length; i += 1) {
        const link = links[i]!;
        const [{ id }] = await trx
            .table("product_attribute_links")
            .returning("id")
            .insert({
                product_id: productId,
                attribute_id: link.attribute_id,
                position: link.position ?? i,
                visible: link.visible ?? true,
                used_for_variation: link.used_for_variation ?? false,
                display_type: link.display_type ?? "dropdown",
                created_at: now,
                updated_at: now,
            });
        if (link.term_ids.length > 0) {
            await trx.table("product_attribute_link_terms").insert(
                link.term_ids.map((termId) => ({
                    link_id: id,
                    term_id: termId,
                    created_at: now,
                    updated_at: now,
                })),
            );
        }
    }
}

export interface CustomAttributeInput {
    id?: number;
    name: string;
    values: string[];
    position?: number;
    visible?: boolean;
}

/**
 * Replace `product_custom_attributes` rows for a product. Same diff-by-id shape as
 * {@link syncProductDownloads}: rows whose `id` is not in the inbound list are deleted,
 * rows with no id are inserted, rows with an id are updated in-place. Position falls back
 * to array index. Values are stored as a JSONB string[] inline — they have no shared term
 * table by design, and they never feed the variations cartesian builder.
 */
export async function syncProductCustomAttributes(
    trx: TransactionClientContract,
    productId: bigint | number,
    rows: CustomAttributeInput[] | undefined,
): Promise<void> {
    if (rows === undefined) return;
    const now = DateTime.utc().toSQL();
    const keepIds = rows.map((r) => r.id).filter((id): id is number => typeof id === "number" && Number.isFinite(id));
    if (keepIds.length === 0) {
        await trx.from("product_custom_attributes").where("product_id", String(productId)).delete();
    } else {
        await trx.from("product_custom_attributes").where("product_id", String(productId)).whereNotIn("id", keepIds).delete();
    }
    let index = 0;
    for (const row of rows) {
        const position = row.position ?? index;
        const valuesJson = JSON.stringify(row.values ?? []);
        if (typeof row.id === "number" && Number.isFinite(row.id)) {
            await trx
                .from("product_custom_attributes")
                .where("id", row.id)
                .where("product_id", String(productId))
                .update({
                    name: row.name,
                    values: valuesJson,
                    position,
                    visible: row.visible ?? true,
                    updated_at: now,
                });
        } else {
            await trx.table("product_custom_attributes").insert({
                product_id: productId,
                name: row.name,
                values: valuesJson,
                position,
                visible: row.visible ?? true,
                created_at: now,
                updated_at: now,
            });
        }
        index += 1;
    }
}

/** Replace `product_images` rows for a product with the given media ids, preserving order. */
export async function syncProductImages(
    trx: TransactionClientContract,
    productId: bigint | number,
    mediaIds: number[] | undefined,
): Promise<void> {
    if (mediaIds === undefined) return;
    await trx.from("product_images").where("product_id", String(productId)).delete();
    if (mediaIds.length === 0) return;
    const now = DateTime.utc().toSQL();
    await trx.table("product_images").insert(
        mediaIds.map((mediaId, position) => ({
            product_id: productId,
            media_id: mediaId,
            position,
            created_at: now,
            updated_at: now,
        })),
    );
}

/** A pragmatic catch-all transaction helper so controllers don't repeat `db.transaction(async (trx) => { ... })`. */
export function withTransaction<T>(fn: (trx: TransactionClientContract) => Promise<T>): Promise<T> {
    return db.transaction(fn);
}
