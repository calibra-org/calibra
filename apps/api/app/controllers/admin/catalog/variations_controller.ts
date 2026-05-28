import type { HttpContext } from "@adonisjs/core/http";
import type { TransactionClientContract } from "@adonisjs/lucid/types/database";
import { DateTime } from "luxon";

import Product from "#models/product";
import ProductAttributeLink from "#models/product_attribute_link";
import ProductVariation from "#models/product_variation";
import { CacheInvalidation } from "#services/cache_invalidation";
import { upsertTranslations, withTransaction } from "#services/catalog_writer";
import { adminVariationsView } from "#table_views/admin/variations";
import { collection, resource } from "#transformers/api_envelope";
import ProductVariationTransformer from "#transformers/product_variation_transformer";
import {
    batchVariationsValidator,
    createVariationValidator,
    updateVariationValidator,
} from "#validators/catalog/variation_validator";

const VARIATION_FIELDS = ["description"] as const;

/**
 * `maxLimit` is raised to 500 (above the TableView default cap of 100) so the variations grid
 * can render every version of a variable product in one shot without paginating. Uniform across
 * the catalog family.
 */
const adminVariationsListValidator = adminVariationsView.compileStrict({ defaultLimit: 100, maxLimit: 500 });

export default class AdminVariationsController {
    async index(ctx: HttpContext) {
        const product = await Product.find(ctx.params.product_id);
        if (!product) return ctx.response.status(404).json({ error: "product_not_found" });
        const parsed = await adminVariationsListValidator.validate(ctx.request.qs());
        /** Parent-id + soft-delete pre-scope. Soft-deleted rows are excluded because bulk
         * delete writes `deleted_at` (rather than removing rows outright) so order history can
         * still reference them; without this filter, just-deleted rows would reappear on the
         * next refetch and the Sellable versions table would look like the delete failed. */
        const builder = ProductVariation.query()
            .where("product_id", String(product.id))
            .whereNull("deleted_at")
            .preload("translations")
            .preload("attributePins");
        const { data: rows, meta } = await adminVariationsView.run<ProductVariation>(builder, parsed);
        const { data } = await collection<unknown>(ProductVariationTransformer.transform(rows, ctx.i18n.locale));
        return { data, meta };
    }

    async store(ctx: HttpContext) {
        const product = await Product.find(ctx.params.product_id);
        if (!product) return ctx.response.status(404).json({ error: "product_not_found" });
        if (product.type !== "variable") {
            return ctx.response.status(422).json({ error: "parent_product_not_variable" });
        }
        const payload = await ctx.request.validateUsing(createVariationValidator);
        if (payload.attribute_pins) {
            const allowedAttributeIds = (
                await ProductAttributeLink.query()
                    .where("product_id", String(product.id))
                    .where("used_for_variation", true)
                    .select("attribute_id")
            ).map((row) => Number(row.attributeId));
            for (const pin of payload.attribute_pins) {
                if (!allowedAttributeIds.includes(pin.attribute_id)) {
                    return ctx.response
                        .status(422)
                        .json({ error: "attribute_pin_not_variation_attribute", attribute_id: pin.attribute_id });
                }
            }
        }
        const row = await withTransaction(async (trx) => {
            const created = new ProductVariation();
            created.useTransaction(trx);
            created.productId = product.id;
            applyVariationFields(created, payload);
            await created.save();
            if (payload.translations) {
                await upsertTranslations(
                    trx,
                    "product_variation_translations",
                    "variation_id",
                    created.id,
                    payload.translations as never,
                    VARIATION_FIELDS as never,
                );
            }
            await syncVariationAttributePins(trx, created.id, payload.attribute_pins);
            return created;
        });
        await row.refresh();
        await row.load("translations");
        await row.load("attributePins");
        await CacheInvalidation.productChanged(product.id);
        ctx.response.status(201);
        return resource(ProductVariationTransformer.transform(row, ctx.i18n.locale));
    }

    async update(ctx: HttpContext) {
        const row = await ProductVariation.query()
            .where("product_id", String(ctx.params.product_id))
            .where("id", ctx.params.id)
            .first();
        if (!row) return ctx.response.status(404).json({ error: "variation_not_found" });
        const payload = await ctx.request.validateUsing(updateVariationValidator);
        await withTransaction(async (trx) => {
            row.useTransaction(trx);
            applyVariationFields(row, payload);
            await row.save();
            if (payload.translations) {
                await upsertTranslations(
                    trx,
                    "product_variation_translations",
                    "variation_id",
                    row.id,
                    payload.translations as never,
                    VARIATION_FIELDS as never,
                );
            }
            await syncVariationAttributePins(trx, row.id, payload.attribute_pins);
        });
        await row.load("translations");
        await row.load("attributePins");
        await CacheInvalidation.productChanged(row.productId);
        return resource(ProductVariationTransformer.transform(row, ctx.i18n.locale));
    }

    async destroy(ctx: HttpContext) {
        const row = await ProductVariation.query()
            .where("product_id", String(ctx.params.product_id))
            .where("id", ctx.params.id)
            .first();
        if (!row) return ctx.response.status(404).json({ error: "variation_not_found" });
        row.deletedAt = DateTime.utc();
        await row.save();
        await CacheInvalidation.productChanged(row.productId);
        return ctx.response.status(204);
    }

    /**
     * `POST /admin/products/:product_id/variations/batch` — atomic `{create, update, delete}` over
     * a variable product's variations. Refuses with 422 when the parent product isn't `variable`.
     * Each create/update entry re-runs through the single-row validator (the outer validator only
     * checks shape), mirroring the products-batch pattern.
     */
    async batch(ctx: HttpContext) {
        const product = await Product.find(ctx.params.product_id);
        if (!product) return ctx.response.status(404).json({ error: "product_not_found" });
        if (product.type !== "variable") {
            return ctx.response.status(422).json({ error: "parent_product_not_variable" });
        }
        const payload = await ctx.request.validateUsing(batchVariationsValidator);

        const allowedAttributeIds = (
            await ProductAttributeLink.query()
                .where("product_id", String(product.id))
                .where("used_for_variation", true)
                .select("attribute_id")
        ).map((row) => Number(row.attributeId));

        const created: number[] = [];
        const updated: number[] = [];
        const deleted: number[] = [];

        await withTransaction(async (trx) => {
            for (const body of payload.create ?? []) {
                const validated = await createVariationValidator.validate(body);
                if (validated.attribute_pins) {
                    for (const pin of validated.attribute_pins) {
                        if (!allowedAttributeIds.includes(pin.attribute_id)) {
                            throw new Error(`attribute_pin_not_variation_attribute:${pin.attribute_id}`);
                        }
                    }
                }
                const row = new ProductVariation();
                row.useTransaction(trx);
                row.productId = product.id;
                applyVariationFields(row, validated);
                await row.save();
                if (validated.translations) {
                    await upsertTranslations(
                        trx,
                        "product_variation_translations",
                        "variation_id",
                        row.id,
                        validated.translations as never,
                        VARIATION_FIELDS as never,
                    );
                }
                await syncVariationAttributePins(trx, row.id, validated.attribute_pins);
                created.push(Number(row.id));
            }
            for (const body of payload.update ?? []) {
                const id = (body as { id?: number }).id;
                if (typeof id !== "number") continue;
                const row = await ProductVariation.query({ client: trx })
                    .where("product_id", String(product.id))
                    .where("id", id)
                    .first();
                if (!row) continue;
                const validated = await updateVariationValidator.validate(body);
                applyVariationFields(row, validated);
                await row.save();
                if (validated.translations) {
                    await upsertTranslations(
                        trx,
                        "product_variation_translations",
                        "variation_id",
                        row.id,
                        validated.translations as never,
                        VARIATION_FIELDS as never,
                    );
                }
                await syncVariationAttributePins(trx, row.id, validated.attribute_pins);
                updated.push(Number(row.id));
            }
            for (const id of payload.delete ?? []) {
                if (!Number.isFinite(id) || id <= 0) continue;
                await ProductVariation.query({ client: trx })
                    .where("product_id", String(product.id))
                    .where("id", id)
                    .update({ deleted_at: DateTime.utc().toSQL() });
                deleted.push(id);
            }
        });

        await CacheInvalidation.productChanged(product.id);
        return { data: { created, updated, deleted } };
    }
}

function applyVariationFields(row: ProductVariation, payload: Record<string, unknown>): void {
    if (payload.sku !== undefined) row.sku = (payload.sku as string | null) ?? null;
    if (payload.regular_price !== undefined) row.regularPrice = (payload.regular_price as number | null) ?? null;
    if (payload.sale_price !== undefined) row.salePrice = (payload.sale_price as number | null) ?? null;
    if (payload.sale_starts_at !== undefined)
        row.saleStartsAt = payload.sale_starts_at ? DateTime.fromJSDate(payload.sale_starts_at as Date) : null;
    if (payload.sale_ends_at !== undefined)
        row.saleEndsAt = payload.sale_ends_at ? DateTime.fromJSDate(payload.sale_ends_at as Date) : null;
    if (payload.weight_grams !== undefined) row.weightGrams = (payload.weight_grams as number | null) ?? null;
    if (payload.length_mm !== undefined) row.lengthMm = (payload.length_mm as number | null) ?? null;
    if (payload.width_mm !== undefined) row.widthMm = (payload.width_mm as number | null) ?? null;
    if (payload.height_mm !== undefined) row.heightMm = (payload.height_mm as number | null) ?? null;
    if (payload.image_media_id !== undefined) row.imageMediaId = (payload.image_media_id as number | null) ?? null;
    if (payload.virtual !== undefined) row.virtual = !!payload.virtual;
    if (payload.downloadable !== undefined) row.downloadable = !!payload.downloadable;
    if (payload.tax_class_id !== undefined) row.taxClassId = (payload.tax_class_id as number | null) ?? null;
    if (payload.manage_stock_mode !== undefined) row.manageStockMode = payload.manage_stock_mode as string;
    if (payload.menu_order !== undefined) row.menuOrder = payload.menu_order as number;
    if (payload.status !== undefined) row.status = payload.status as string;
    if (payload.attributes !== undefined) row.attributes = payload.attributes ?? {};
}

async function syncVariationAttributePins(
    trx: TransactionClientContract,
    variationId: bigint | number,
    pins: Array<{ attribute_id: number; term_id: number | null }> | undefined,
): Promise<void> {
    if (pins === undefined) return;
    await trx.from("product_variation_attributes").where("variation_id", String(variationId)).delete();
    if (pins.length === 0) return;
    const now = DateTime.utc().toSQL();
    await trx.table("product_variation_attributes").insert(
        pins.map((pin) => ({
            variation_id: variationId,
            attribute_id: pin.attribute_id,
            term_id: pin.term_id,
            created_at: now,
            updated_at: now,
        })),
    );
}
