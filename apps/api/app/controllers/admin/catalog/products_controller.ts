import type { HttpContext } from "@adonisjs/core/http";
import { DateTime } from "luxon";

import Product from "#models/product";
import { syncLinks, syncProductImages, upsertTranslations, withTransaction } from "#services/catalog_writer";
import { paginated, resource } from "#transformers/api_envelope";
import ProductTransformer from "#transformers/product_transformer";
import { batchProductsValidator, createProductValidator, updateProductValidator } from "#validators/catalog/product_validator";

const PRODUCT_TRANSLATION_FIELDS = [
    "name",
    "slug",
    "description",
    "short_description",
    "purchase_note",
    "external_button_text",
] as const;

export default class AdminProductsController {
    /** `GET /api/v1/admin/products` — admin list, includes soft-deleted via `?with_trashed=1`. */
    async index(ctx: HttpContext) {
        const { request } = ctx;
        const page = Math.max(1, Number(request.input("page", 1)) || 1);
        const perPage = Math.min(200, Math.max(1, Number(request.input("per_page", 20)) || 20));
        const withTrashed = String(request.input("with_trashed", "")) === "1";
        const query = Product.query()
            .preload("translations")
            .preload("images", (q) => q.preload("media"));
        if (!withTrashed) query.whereNull("deleted_at");
        if (request.input("status")) query.where("status", String(request.input("status")));
        if (request.input("type")) query.where("type", String(request.input("type")));
        const search = request.input("search");
        if (search) {
            const needle = `%${String(search)}%`;
            query.whereIn("id", (sub) => sub.select("product_id").from("product_translations").whereILike("name", needle));
        }
        query.orderBy("id", "desc");
        const paginator = await query.paginate(page, perPage);
        return paginated(ProductTransformer.transform(paginator.all()).useVariant("forAdmin"), paginator);
    }

    async show(ctx: HttpContext) {
        const product = await Product.query()
            .where("id", ctx.params.id)
            .preload("translations")
            .preload("images", (q) => q.preload("media"))
            .preload("variations", (q) => q.preload("translations").preload("attributePins"))
            .preload("attributeLinks", (q) => q.preload("terms"))
            .preload("categories", (q) => q.preload("translations"))
            .preload("tags", (q) => q.preload("translations"))
            .preload("brands", (q) => q.preload("translations"))
            .first();
        if (!product) {
            return ctx.response.status(404).json({ error: "product_not_found" });
        }
        return resource(ProductTransformer.transform(product, ctx.i18n.locale).useVariant("forAdmin"));
    }

    async store(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(createProductValidator);
        const product = await withTransaction(async (trx) => {
            const row = new Product();
            row.useTransaction(trx);
            assignProductFields(row, payload);
            await row.save();
            await upsertTranslations(
                trx,
                "product_translations",
                "product_id",
                row.id,
                payload.translations as never,
                PRODUCT_TRANSLATION_FIELDS as never,
            );
            await syncLinks(trx, "product_category_links", "product_id", row.id, "category_id", payload.category_ids);
            await syncLinks(trx, "product_tag_links", "product_id", row.id, "tag_id", payload.tag_ids);
            await syncLinks(trx, "product_brand_links", "product_id", row.id, "brand_id", payload.brand_ids);
            await syncProductImages(trx, row.id, payload.image_media_ids);
            return row;
        });
        const reloaded = await this.reload(product.id);
        ctx.response.status(201);
        return resource(ProductTransformer.transform(reloaded!, ctx.i18n.locale).useVariant("forAdmin"));
    }

    async update(ctx: HttpContext) {
        const product = await Product.query().where("id", ctx.params.id).first();
        if (!product) {
            return ctx.response.status(404).json({ error: "product_not_found" });
        }
        const payload = await ctx.request.validateUsing(updateProductValidator);
        await withTransaction(async (trx) => {
            product.useTransaction(trx);
            assignProductFields(product, payload);
            await product.save();
            if (payload.translations) {
                await upsertTranslations(
                    trx,
                    "product_translations",
                    "product_id",
                    product.id,
                    payload.translations as never,
                    PRODUCT_TRANSLATION_FIELDS as never,
                );
            }
            await syncLinks(trx, "product_category_links", "product_id", product.id, "category_id", payload.category_ids);
            await syncLinks(trx, "product_tag_links", "product_id", product.id, "tag_id", payload.tag_ids);
            await syncLinks(trx, "product_brand_links", "product_id", product.id, "brand_id", payload.brand_ids);
            await syncProductImages(trx, product.id, payload.image_media_ids);
        });
        const reloaded = await this.reload(product.id);
        return resource(ProductTransformer.transform(reloaded!, ctx.i18n.locale).useVariant("forAdmin"));
    }

    async destroy(ctx: HttpContext) {
        const product = await Product.query().where("id", ctx.params.id).whereNull("deleted_at").first();
        if (!product) {
            return ctx.response.status(404).json({ error: "product_not_found" });
        }
        product.deletedAt = DateTime.utc();
        await product.save();
        return ctx.response.status(204);
    }

    /** `POST /admin/products/:id/duplicate` — deep copy of translations + images. */
    async duplicate(ctx: HttpContext) {
        const source = await Product.query().where("id", ctx.params.id).preload("translations").preload("images").first();
        if (!source) {
            return ctx.response.status(404).json({ error: "product_not_found" });
        }
        const copy = await withTransaction(async (trx) => {
            const row = new Product();
            row.useTransaction(trx);
            row.type = source.type;
            row.sku = null;
            row.status = "draft";
            row.catalogVisibility = source.catalogVisibility;
            row.featured = false;
            row.virtual = source.virtual;
            row.downloadable = source.downloadable;
            row.regularPrice = source.regularPrice;
            row.salePrice = null;
            row.taxClassId = source.taxClassId;
            row.taxStatus = source.taxStatus;
            row.shippingClassId = source.shippingClassId;
            row.weightGrams = source.weightGrams;
            row.lengthMm = source.lengthMm;
            row.widthMm = source.widthMm;
            row.heightMm = source.heightMm;
            row.soldIndividually = source.soldIndividually;
            row.reviewsAllowed = source.reviewsAllowed;
            row.externalUrl = source.externalUrl;
            row.menuOrder = source.menuOrder;
            row.attributes = source.attributes;
            await row.save();
            const translationRows = source.translations.map((t) => ({
                locale: t.locale,
                name: `${t.name} (Copy)`,
                slug: `${t.slug}-copy-${row.id}`,
                description: t.description,
                short_description: t.shortDescription,
                purchase_note: t.purchaseNote,
                external_button_text: t.externalButtonText,
            }));
            await upsertTranslations(
                trx,
                "product_translations",
                "product_id",
                row.id,
                translationRows as never,
                PRODUCT_TRANSLATION_FIELDS as never,
            );
            const mediaIds = source.images
                .slice()
                .sort((a, b) => a.position - b.position)
                .map((img) => Number(img.mediaId));
            await syncProductImages(trx, row.id, mediaIds);
            return row;
        });
        const reloaded = await this.reload(copy.id);
        ctx.response.status(201);
        return resource(ProductTransformer.transform(reloaded!, ctx.i18n.locale).useVariant("forAdmin"));
    }

    /** `POST /admin/products/batch` — atomic `{create, update, delete}` batch operation. */
    async batch(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(batchProductsValidator);
        const createdIds: number[] = [];
        const updatedIds: number[] = [];
        const deletedIds: number[] = [];
        await withTransaction(async (trx) => {
            for (const body of payload.create ?? []) {
                const validated = await createProductValidator.validate(body);
                const row = new Product();
                row.useTransaction(trx);
                assignProductFields(row, validated);
                await row.save();
                await upsertTranslations(
                    trx,
                    "product_translations",
                    "product_id",
                    row.id,
                    validated.translations as never,
                    PRODUCT_TRANSLATION_FIELDS as never,
                );
                await syncLinks(trx, "product_category_links", "product_id", row.id, "category_id", validated.category_ids);
                await syncLinks(trx, "product_tag_links", "product_id", row.id, "tag_id", validated.tag_ids);
                await syncLinks(trx, "product_brand_links", "product_id", row.id, "brand_id", validated.brand_ids);
                await syncProductImages(trx, row.id, validated.image_media_ids);
                createdIds.push(Number(row.id));
            }
            for (const body of payload.update ?? []) {
                const validated = await updateProductValidator.validate(body);
                const row = await Product.query({ client: trx })
                    .where("id", (body as { id: number }).id)
                    .first();
                if (!row) continue;
                assignProductFields(row, validated);
                await row.save();
                if (validated.translations) {
                    await upsertTranslations(
                        trx,
                        "product_translations",
                        "product_id",
                        row.id,
                        validated.translations as never,
                        PRODUCT_TRANSLATION_FIELDS as never,
                    );
                }
                await syncLinks(trx, "product_category_links", "product_id", row.id, "category_id", validated.category_ids);
                await syncLinks(trx, "product_tag_links", "product_id", row.id, "tag_id", validated.tag_ids);
                await syncLinks(trx, "product_brand_links", "product_id", row.id, "brand_id", validated.brand_ids);
                await syncProductImages(trx, row.id, validated.image_media_ids);
                updatedIds.push(Number(row.id));
            }
            for (const id of payload.delete ?? []) {
                await Product.query({ client: trx })
                    .where("id", id)
                    .whereNull("deleted_at")
                    .update({ deleted_at: DateTime.utc().toSQL() });
                deletedIds.push(Number(id));
            }
        });
        return { data: { created: createdIds, updated: updatedIds, deleted: deletedIds } };
    }

    private async reload(id: bigint | number): Promise<Product | null> {
        return Product.query()
            .where("id", String(id))
            .preload("translations")
            .preload("images", (q) => q.preload("media"))
            .preload("variations", (q) => q.preload("translations").preload("attributePins"))
            .preload("attributeLinks", (q) => q.preload("terms"))
            .preload("categories", (q) => q.preload("translations"))
            .preload("tags", (q) => q.preload("translations"))
            .preload("brands", (q) => q.preload("translations"))
            .first();
    }
}

function assignProductFields(row: Product, payload: Record<string, unknown>): void {
    if (payload.type !== undefined) row.type = payload.type as string;
    if (payload.sku !== undefined) row.sku = (payload.sku as string | null) ?? null;
    if (payload.status !== undefined) row.status = payload.status as string;
    if (payload.catalog_visibility !== undefined) row.catalogVisibility = payload.catalog_visibility as string;
    if (payload.featured !== undefined) row.featured = !!payload.featured;
    if (payload.virtual !== undefined) row.virtual = !!payload.virtual;
    if (payload.downloadable !== undefined) row.downloadable = !!payload.downloadable;
    if (payload.regular_price !== undefined) row.regularPrice = (payload.regular_price as number | null) ?? null;
    if (payload.sale_price !== undefined) row.salePrice = (payload.sale_price as number | null) ?? null;
    if (payload.sale_starts_at !== undefined)
        row.saleStartsAt = payload.sale_starts_at ? DateTime.fromJSDate(payload.sale_starts_at as Date) : null;
    if (payload.sale_ends_at !== undefined)
        row.saleEndsAt = payload.sale_ends_at ? DateTime.fromJSDate(payload.sale_ends_at as Date) : null;
    if (payload.tax_class_id !== undefined) row.taxClassId = (payload.tax_class_id as number | null) ?? null;
    if (payload.tax_status !== undefined) row.taxStatus = payload.tax_status as string;
    if (payload.shipping_class_id !== undefined) row.shippingClassId = (payload.shipping_class_id as number | null) ?? null;
    if (payload.weight_grams !== undefined) row.weightGrams = (payload.weight_grams as number | null) ?? null;
    if (payload.length_mm !== undefined) row.lengthMm = (payload.length_mm as number | null) ?? null;
    if (payload.width_mm !== undefined) row.widthMm = (payload.width_mm as number | null) ?? null;
    if (payload.height_mm !== undefined) row.heightMm = (payload.height_mm as number | null) ?? null;
    if (payload.sold_individually !== undefined) row.soldIndividually = !!payload.sold_individually;
    if (payload.reviews_allowed !== undefined) row.reviewsAllowed = !!payload.reviews_allowed;
    if (payload.external_url !== undefined) row.externalUrl = (payload.external_url as string | null) ?? null;
    if (payload.menu_order !== undefined) row.menuOrder = payload.menu_order as number;
    if (payload.attributes !== undefined) row.attributes = payload.attributes ?? {};
}
