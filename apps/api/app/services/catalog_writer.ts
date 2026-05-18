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
