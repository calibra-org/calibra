import type { TransactionClientContract } from "@adonisjs/lucid/types/database";
import { DateTime } from "luxon";

import type { ProductImportDTO } from "#services/product_import/row_projector";
import {
    type NewRowCounters,
    resolveBrand,
    resolveCategoryPath,
    resolveTags,
    resolveTaxClass,
} from "#services/product_import/taxonomy_resolver";
import { slugify } from "#services/slug_service";

/**
 * Bridge between a projected `ProductImportDTO` and the products table + its satellites. Owns the
 * minor-units conversion for prices, the auto-create-then-link cycle for taxonomy, and the inventory
 * upsert. Emits per-field `ChangeRecord`s back to the runner so the import-change log captures the
 * old → new diff for the history detail view.
 *
 * Out of scope for the first cut (intentional TODOs):
 *  - Variations (variable products): parent SKU is captured but the variation linking is deferred.
 *  - Image sideloading: URLs are counted but not fetched — the runner reports the queue depth so
 *    operators know images are pending.
 *  - Cross-sell / upsell SKU resolution: counted but not linked.
 */

export interface ChangeRecord {
    field: string;
    oldValue: string | null;
    newValue: string | null;
}

export interface WriteOutcome {
    productId: number;
    changes: ChangeRecord[];
    queuedImageCount: number;
}

const PRODUCT_TRANSLATION_FIELDS = ["name", "slug", "description", "short_description", "purchase_note"] as const;

type ProductRow = {
    id: number | bigint;
    sku: string | null;
    name?: string;
    type: string;
    status: string;
    catalog_visibility: string;
    featured: boolean;
    regular_price: number | bigint | null;
    sale_price: number | bigint | null;
    tax_status: string;
    tax_class_id: number | bigint | null;
    shipping_class_id: number | bigint | null;
    weight_grams: number | null;
    length_mm: number | null;
    width_mm: number | null;
    height_mm: number | null;
    sold_individually: boolean;
    reviews_allowed: boolean;
    external_url: string | null;
    menu_order: number;
};

/**
 * Apply `dto` to an existing product, returning the per-field diff for the change log. Only
 * mapped fields (keys present in `dto`) move; everything else stays put.
 */
export async function applyUpdate(
    trx: TransactionClientContract,
    existing: ProductRow,
    dto: ProductImportDTO,
    locale: string,
    counters: NewRowCounters,
): Promise<WriteOutcome> {
    const changes: ChangeRecord[] = [];
    const productUpdates: Record<string, unknown> = {};

    applyProductFields(productUpdates, changes, existing, dto);

    if (Object.keys(productUpdates).length > 0) {
        productUpdates.updated_at = DateTime.utc().toSQL();
        await trx.from("products").where("id", String(existing.id)).update(productUpdates);
    }

    if (
        dto.name !== undefined ||
        dto.description !== undefined ||
        dto.short_description !== undefined ||
        dto.purchase_note !== undefined
    ) {
        await upsertProductTranslation(trx, Number(existing.id), dto, locale, existing.name);
    }

    if (dto.tax_class !== undefined && dto.tax_class !== null) {
        const taxClassId = await resolveTaxClass(trx, dto.tax_class);
        if (taxClassId !== null && taxClassId !== existing.tax_class_id) {
            await trx.from("products").where("id", String(existing.id)).update({ tax_class_id: taxClassId });
            changes.push({ field: "tax_class_id", oldValue: String(existing.tax_class_id ?? ""), newValue: String(taxClassId) });
        }
    }

    if (dto.categories !== undefined) {
        const ids: number[] = [];
        for (const path of dto.categories) {
            ids.push(await resolveCategoryPath(trx, path, locale, counters));
        }
        await syncCategoryLinks(trx, Number(existing.id), ids);
        changes.push({ field: "categories", oldValue: null, newValue: ids.join(",") });
    }
    if (dto.tags !== undefined) {
        const ids = await resolveTags(trx, dto.tags, locale, counters);
        await syncTagLinks(trx, Number(existing.id), ids);
        changes.push({ field: "tags", oldValue: null, newValue: ids.join(",") });
    }
    if (dto.brand !== undefined && dto.brand !== null) {
        const brandId = await resolveBrand(trx, dto.brand, locale, counters);
        if (brandId !== null) {
            await syncBrandLinks(trx, Number(existing.id), [brandId]);
            changes.push({ field: "brand_id", oldValue: null, newValue: String(brandId) });
        }
    }

    if (dto.manage_stock !== undefined || dto.stock_quantity !== undefined || dto.stock_status !== undefined) {
        await upsertInventory(trx, Number(existing.id), dto);
        changes.push({ field: "inventory", oldValue: null, newValue: stockSummary(dto) });
    }

    const queuedImageCount = dto.images?.length ?? 0;

    return { productId: Number(existing.id), changes, queuedImageCount };
}

/**
 * Insert a fresh product row + its translation + taxonomy links + inventory row. Returns the new
 * id so the runner can record an `op: 'create'` change.
 */
export async function applyCreate(
    trx: TransactionClientContract,
    dto: ProductImportDTO,
    locale: string,
    counters: NewRowCounters,
): Promise<WriteOutcome> {
    const now = DateTime.utc().toSQL();
    const insertRow: Record<string, unknown> = {
        type: dto.type ?? "simple",
        sku: dto.sku ?? null,
        status: dto.status ?? "draft",
        catalog_visibility: dto.visibility ?? "visible",
        featured: dto.featured ?? false,
        virtual: false,
        downloadable: false,
        regular_price:
            dto.regular_price_major !== undefined && dto.regular_price_major !== null
                ? Math.round(dto.regular_price_major * 10)
                : null,
        sale_price:
            dto.sale_price_major !== undefined && dto.sale_price_major !== null ? Math.round(dto.sale_price_major * 10) : null,
        sale_starts_at: dto.sale_price_start ?? null,
        sale_ends_at: dto.sale_price_end ?? null,
        tax_status: dto.tax_status ?? "taxable",
        weight_grams: dto.weight_grams ?? null,
        length_mm: dto.length_mm ?? null,
        width_mm: dto.width_mm ?? null,
        height_mm: dto.height_mm ?? null,
        sold_individually: dto.sold_individually ?? false,
        reviews_allowed: dto.allow_reviews ?? true,
        external_url: dto.external_url ?? null,
        menu_order: dto.menu_order ?? 0,
        attributes: {},
        created_at: now,
        updated_at: now,
    };

    if (dto.tax_class !== undefined && dto.tax_class !== null) {
        const taxClassId = await resolveTaxClass(trx, dto.tax_class);
        if (taxClassId !== null) insertRow.tax_class_id = taxClassId;
    }

    const [insertedRaw] = await trx.table("products").insert(insertRow).returning("id");
    const productId = Number((insertedRaw as { id: number | bigint }).id);

    const name = dto.name ?? `محصول ${productId}`;
    const slug = `${slugify(name, locale === "fa" ? "fa" : "en")}-${productId}`;
    await trx.table("product_translations").insert({
        product_id: productId,
        locale,
        name,
        slug,
        description: dto.description ?? null,
        short_description: dto.short_description ?? null,
        purchase_note: dto.purchase_note ?? null,
        external_button_text: dto.button_text ?? null,
        created_at: now,
        updated_at: now,
    });

    if (dto.categories !== undefined) {
        const ids: number[] = [];
        for (const path of dto.categories) ids.push(await resolveCategoryPath(trx, path, locale, counters));
        await syncCategoryLinks(trx, productId, ids);
    }
    if (dto.tags !== undefined) {
        const ids = await resolveTags(trx, dto.tags, locale, counters);
        await syncTagLinks(trx, productId, ids);
    }
    if (dto.brand !== undefined && dto.brand !== null) {
        const brandId = await resolveBrand(trx, dto.brand, locale, counters);
        if (brandId !== null) await syncBrandLinks(trx, productId, [brandId]);
    }

    await upsertInventory(trx, productId, dto);

    const queuedImageCount = dto.images?.length ?? 0;
    return {
        productId,
        changes: buildCreateChanges(dto, productId, name),
        queuedImageCount,
    };
}

function applyProductFields(
    target: Record<string, unknown>,
    changes: ChangeRecord[],
    existing: ProductRow,
    dto: ProductImportDTO,
): void {
    if (dto.type !== undefined && dto.type !== existing.type) {
        target.type = dto.type;
        changes.push({ field: "type", oldValue: existing.type, newValue: dto.type });
    }
    if (dto.status !== undefined && dto.status !== existing.status) {
        target.status = dto.status;
        changes.push({ field: "status", oldValue: existing.status, newValue: dto.status });
    }
    if (dto.visibility !== undefined && dto.visibility !== existing.catalog_visibility) {
        target.catalog_visibility = dto.visibility;
        changes.push({ field: "catalog_visibility", oldValue: existing.catalog_visibility, newValue: dto.visibility });
    }
    if (dto.featured !== undefined && dto.featured !== existing.featured) {
        target.featured = dto.featured;
        changes.push({ field: "featured", oldValue: String(existing.featured), newValue: String(dto.featured) });
    }
    if (dto.regular_price_major !== undefined) {
        const minor = dto.regular_price_major === null ? null : Math.round(dto.regular_price_major * 10);
        if (Number(existing.regular_price ?? -1) !== Number(minor ?? -1)) {
            target.regular_price = minor;
            changes.push({
                field: "regular_price",
                oldValue: existing.regular_price === null ? null : String(existing.regular_price),
                newValue: minor === null ? null : String(minor),
            });
        }
    }
    if (dto.sale_price_major !== undefined) {
        const minor = dto.sale_price_major === null ? null : Math.round(dto.sale_price_major * 10);
        if (Number(existing.sale_price ?? -1) !== Number(minor ?? -1)) {
            target.sale_price = minor;
            changes.push({
                field: "sale_price",
                oldValue: existing.sale_price === null ? null : String(existing.sale_price),
                newValue: minor === null ? null : String(minor),
            });
        }
    }
    if (dto.sale_price_start !== undefined) target.sale_starts_at = dto.sale_price_start;
    if (dto.sale_price_end !== undefined) target.sale_ends_at = dto.sale_price_end;
    if (dto.tax_status !== undefined && dto.tax_status !== existing.tax_status) {
        target.tax_status = dto.tax_status;
        changes.push({ field: "tax_status", oldValue: existing.tax_status, newValue: dto.tax_status });
    }
    if (dto.weight_grams !== undefined && dto.weight_grams !== existing.weight_grams) {
        target.weight_grams = dto.weight_grams;
        changes.push({
            field: "weight_grams",
            oldValue: existing.weight_grams === null ? null : String(existing.weight_grams),
            newValue: dto.weight_grams === null ? null : String(dto.weight_grams),
        });
    }
    if (dto.length_mm !== undefined && dto.length_mm !== existing.length_mm) target.length_mm = dto.length_mm;
    if (dto.width_mm !== undefined && dto.width_mm !== existing.width_mm) target.width_mm = dto.width_mm;
    if (dto.height_mm !== undefined && dto.height_mm !== existing.height_mm) target.height_mm = dto.height_mm;
    if (dto.sold_individually !== undefined && dto.sold_individually !== existing.sold_individually) {
        target.sold_individually = dto.sold_individually;
    }
    if (dto.allow_reviews !== undefined && dto.allow_reviews !== existing.reviews_allowed) {
        target.reviews_allowed = dto.allow_reviews;
    }
    if (dto.external_url !== undefined && dto.external_url !== existing.external_url) {
        target.external_url = dto.external_url;
    }
    if (dto.menu_order !== undefined && dto.menu_order !== existing.menu_order) {
        target.menu_order = dto.menu_order;
    }
}

async function upsertProductTranslation(
    trx: TransactionClientContract,
    productId: number,
    dto: ProductImportDTO,
    locale: string,
    existingName: string | undefined,
): Promise<void> {
    const now = DateTime.utc().toSQL();
    const name = dto.name ?? existingName ?? `محصول ${productId}`;
    const slugSeed = dto.name ?? existingName ?? `product-${productId}`;
    const slug = `${slugify(slugSeed, locale === "fa" ? "fa" : "en")}-${productId}`;

    const record: Record<string, unknown> = {
        product_id: productId,
        locale,
        name,
        slug,
        description: dto.description ?? null,
        short_description: dto.short_description ?? null,
        purchase_note: dto.purchase_note ?? null,
        external_button_text: dto.button_text ?? null,
        created_at: now,
        updated_at: now,
    };

    await trx
        .table("product_translations")
        .insert(record)
        .onConflict(["product_id", "locale"])
        .merge([...PRODUCT_TRANSLATION_FIELDS, "external_button_text", "updated_at"]);
}

async function syncCategoryLinks(trx: TransactionClientContract, productId: number, ids: number[]): Promise<void> {
    await trx.from("product_category_links").where("product_id", String(productId)).delete();
    if (ids.length === 0) return;
    const now = DateTime.utc().toSQL();
    await trx
        .table("product_category_links")
        .insert(ids.map((id) => ({ product_id: productId, category_id: id, created_at: now, updated_at: now })));
}

async function syncTagLinks(trx: TransactionClientContract, productId: number, ids: number[]): Promise<void> {
    await trx.from("product_tag_links").where("product_id", String(productId)).delete();
    if (ids.length === 0) return;
    const now = DateTime.utc().toSQL();
    await trx
        .table("product_tag_links")
        .insert(ids.map((id) => ({ product_id: productId, tag_id: id, created_at: now, updated_at: now })));
}

async function syncBrandLinks(trx: TransactionClientContract, productId: number, ids: number[]): Promise<void> {
    await trx.from("product_brand_links").where("product_id", String(productId)).delete();
    if (ids.length === 0) return;
    const now = DateTime.utc().toSQL();
    await trx
        .table("product_brand_links")
        .insert(ids.map((id) => ({ product_id: productId, brand_id: id, created_at: now, updated_at: now })));
}

async function upsertInventory(trx: TransactionClientContract, productId: number, dto: ProductImportDTO): Promise<void> {
    const now = DateTime.utc().toSQL();
    const record: Record<string, unknown> = {
        product_id: productId,
        variation_id: null,
        location_id: null,
        manage_stock: dto.manage_stock ?? true,
        stock_quantity: dto.stock_quantity ?? 0,
        stock_status: dto.stock_status ?? "instock",
        backorders: dto.backorders_allowed === true ? "yes" : "no",
        created_at: now,
        updated_at: now,
    };

    /**
     * The unique index is `(product_id, COALESCE(variation_id, 0), COALESCE(location_id, 0))`.
     * Lucid's onConflict cannot reference COALESCE expressions, so check existence first.
     */
    const existing = await trx
        .from("inventory_items")
        .where("product_id", String(productId))
        .whereNull("variation_id")
        .whereNull("location_id")
        .first();

    if (existing === null || existing === undefined) {
        await trx.table("inventory_items").insert(record);
    } else {
        const { created_at: _created, ...updates } = record;
        await trx
            .from("inventory_items")
            .where("id", String((existing as { id: number | bigint }).id))
            .update(updates);
    }
}

function stockSummary(dto: ProductImportDTO): string {
    const parts: string[] = [];
    if (dto.stock_quantity !== undefined && dto.stock_quantity !== null) parts.push(`qty=${dto.stock_quantity}`);
    if (dto.stock_status !== undefined) parts.push(`status=${dto.stock_status}`);
    if (dto.manage_stock !== undefined) parts.push(`manage=${dto.manage_stock}`);
    return parts.join(", ");
}

function buildCreateChanges(dto: ProductImportDTO, productId: number, name: string): ChangeRecord[] {
    const changes: ChangeRecord[] = [
        { field: "product", oldValue: null, newValue: String(productId) },
        { field: "name", oldValue: null, newValue: name },
    ];
    if (dto.regular_price_major !== undefined && dto.regular_price_major !== null) {
        changes.push({
            field: "regular_price",
            oldValue: null,
            newValue: String(Math.round(dto.regular_price_major * 10)),
        });
    }
    if (dto.sku !== undefined && dto.sku !== null) {
        changes.push({ field: "sku", oldValue: null, newValue: dto.sku });
    }
    return changes;
}

export type { ProductRow };
