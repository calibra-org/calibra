import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";
import { DateTime } from "luxon";

import { BusinessRuleException } from "#exceptions/domain_exceptions";
import Product from "#models/product";
import ProductAttributeTerm from "#models/product_attribute_term";
import { recordAudit } from "#services/admin_audit_log_service";
import { CacheInvalidation } from "#services/cache_invalidation";
import {
    syncLinks,
    syncOrderedLinks,
    syncProductAttributeLinks,
    syncProductDownloads,
    syncProductImages,
    upsertTranslations,
    withTransaction,
} from "#services/catalog_writer";
import SettingsService from "#services/settings_service";
import { paginated, resource } from "#transformers/api_envelope";
import ProductTransformer, { type ProductTransformerOptions } from "#transformers/product_transformer";
import {
    batchProductsValidator,
    checkSlugValidator,
    createProductValidator,
    restoreProductsValidator,
    updateProductValidator,
} from "#validators/catalog/product_validator";

const PRODUCT_TRANSLATION_FIELDS = [
    "name",
    "slug",
    "description",
    "short_description",
    "purchase_note",
    "external_button_text",
] as const;

const SORTABLE_COLUMNS = new Set(["name", "sku", "regular_price", "created_at", "updated_at", "menu_order", "stock_quantity"]);

const FACET_COUNT_KEYS = ["type", "stock_status", "category", "brand", "tag", "catalog_visibility"] as const;

/** Orders whose line items still pin a real product reference for the "in use" force-delete guard. */
const ACTIVE_ORDER_STATUSES = ["pending", "on_hold", "processing", "completed"] as const;

export default class AdminProductsController {
    /**
     * `GET /api/v1/admin/products` — paginated admin list.
     *
     * Filter params (all optional, all server-side AND-composed):
     * - `status`, `type`, `category`, `tag`, `brand`, `stock_status` — discrete facets
     * - `with_trashed=1` / `only_trashed=1` — soft-delete inclusion
     * - `on_sale=1` — schedule-aware on-sale predicate
     * - `catalog_visibility` — visible|catalog|search|hidden
     * - `has_image=1` — at least one row in product_images
     * - `created_from`, `created_to` — ISO date-only inclusive bounds
     * - `stock_level=instock|low|outofstock` — aggregate over inventory_items
     * - `featured=1` — featured-only
     * - `search=<q>` — ILIKE on product_translations.name OR products.sku
     * - `ids=<csv>` — id whitelist (used by "export selected" + facet count callers)
     * - `sort=<field>` / `sort=-<field>` — whitelist: name|sku|regular_price|created_at|updated_at|menu_order|stock_quantity
     * - `include=facet_counts` — adds a `facets` block to the response envelope
     */
    async index(ctx: HttpContext) {
        const { request } = ctx;
        const page = Math.max(1, Number(request.input("page", 1)) || 1);
        const perPage = Math.min(200, Math.max(1, Number(request.input("per_page", request.input("perPage", 20))) || 20));

        const query = Product.query()
            .preload("translations")
            .preload("images", (q) => q.preload("media"))
            .preload("inventoryItems");
        this.applyListFilters(query, request);
        this.applyListSort(query, request);

        const paginator = await query.paginate(page, perPage);
        const transformerOptions = await this.transformerOptions();
        const envelope = paginated(
            ProductTransformer.transform(paginator.all(), ctx.i18n.locale, transformerOptions).useVariant("forAdmin"),
            paginator,
        );

        const includes = String(request.input("include", ""))
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        if (includes.includes("facet_counts")) {
            (envelope as { facets?: Record<string, Record<string, number>> }).facets = await this.computeFacetCounts(request);
        }

        return envelope;
    }

    /**
     * Filter pipeline split out so the same predicates can be re-applied to facet-count
     * subqueries with one facet removed at a time. Mutates `query`.
     */
    private applyListFilters(
        query: ReturnType<typeof Product.query>,
        request: HttpContext["request"],
        skipFacet?: (typeof FACET_COUNT_KEYS)[number],
    ) {
        const withTrashed = truthy(request.input("with_trashed"));
        const onlyTrashed = truthy(request.input("only_trashed"));
        if (onlyTrashed) {
            query.whereNotNull("deleted_at");
        } else if (!withTrashed) {
            query.whereNull("deleted_at");
        }

        if (skipFacet !== "type" && request.input("type")) {
            query.where("type", String(request.input("type")));
        }
        if (request.input("status")) query.where("status", String(request.input("status")));
        if (skipFacet !== "catalog_visibility" && request.input("catalog_visibility")) {
            query.where("catalog_visibility", String(request.input("catalog_visibility")));
        }
        if (request.input("featured")) query.where("featured", true);

        if (skipFacet !== "category") {
            const categoryId = Number(request.input("category", 0));
            if (Number.isFinite(categoryId) && categoryId > 0) {
                query.whereIn("id", (sub) =>
                    sub.select("product_id").from("product_category_links").where("category_id", categoryId),
                );
            }
        }
        if (skipFacet !== "tag") {
            const tagId = Number(request.input("tag", 0));
            if (Number.isFinite(tagId) && tagId > 0) {
                query.whereIn("id", (sub) => sub.select("product_id").from("product_tag_links").where("tag_id", tagId));
            }
        }
        if (skipFacet !== "brand") {
            const brandId = Number(request.input("brand", 0));
            if (Number.isFinite(brandId) && brandId > 0) {
                query.whereIn("id", (sub) => sub.select("product_id").from("product_brand_links").where("brand_id", brandId));
            }
        }

        if (request.input("on_sale")) {
            const now = DateTime.utc().toSQL();
            query.whereNotNull("sale_price").where((scope) => {
                scope
                    .where((s) => s.whereNull("sale_starts_at").orWhere("sale_starts_at", "<=", now!))
                    .andWhere((s) => s.whereNull("sale_ends_at").orWhere("sale_ends_at", ">=", now!));
            });
        }

        if (request.input("has_image")) {
            query.whereIn("id", (sub) => sub.select("product_id").from("product_images"));
        }

        const createdFrom = request.input("created_from");
        const createdTo = request.input("created_to");
        if (createdFrom) query.where("created_at", ">=", String(createdFrom));
        if (createdTo) query.where("created_at", "<=", `${String(createdTo)} 23:59:59.999`);

        if (skipFacet !== "stock_status") {
            const stockStatus = request.input("stock_status");
            if (stockStatus) {
                query.whereIn("id", (sub) =>
                    sub.select("product_id").from("inventory_items").where("stock_status", String(stockStatus)),
                );
            }
        }

        const stockLevel = request.input("stock_level");
        if (stockLevel === "outofstock") {
            query.whereIn("id", (sub) =>
                sub.select("product_id").from("inventory_items").groupBy("product_id").havingRaw("SUM(stock_quantity) <= 0"),
            );
        } else if (stockLevel === "low") {
            query.whereIn("id", (sub) =>
                sub
                    .select("product_id")
                    .from("inventory_items")
                    .where("manage_stock", true)
                    .whereNotNull("low_stock_threshold")
                    .where("stock_quantity", ">", 0)
                    .whereRaw("stock_quantity <= low_stock_threshold"),
            );
        } else if (stockLevel === "instock") {
            query.whereIn("id", (sub) =>
                sub.select("product_id").from("inventory_items").groupBy("product_id").havingRaw("SUM(stock_quantity) > 0"),
            );
        }

        const ids = String(request.input("ids", "")).trim();
        if (ids.length > 0) {
            const list = ids
                .split(",")
                .map((s) => Number(s.trim()))
                .filter((n) => Number.isFinite(n) && n > 0);
            if (list.length > 0) query.whereIn("id", list);
        }

        const search = request.input("search");
        if (search) {
            const needle = `%${String(search)}%`;
            query.where((scope) => {
                scope
                    .whereIn("id", (sub) => sub.select("product_id").from("product_translations").whereILike("name", needle))
                    .orWhereILike("sku", needle);
            });
        }
    }

    private applyListSort(query: ReturnType<typeof Product.query>, request: HttpContext["request"]) {
        const raw = String(request.input("sort", "")).trim();
        if (raw.length === 0) {
            query.orderBy("id", "desc");
            return;
        }
        const direction = raw.startsWith("-") ? "desc" : "asc";
        const column = raw.replace(/^-/, "");
        if (!SORTABLE_COLUMNS.has(column)) {
            query.orderBy("id", "desc");
            return;
        }
        if (column === "name") {
            query.orderByRaw(
                `(SELECT MIN(name) FROM product_translations WHERE product_translations.product_id = products.id) ${direction}`,
            );
            return;
        }
        if (column === "stock_quantity") {
            query.orderByRaw(
                `(SELECT COALESCE(SUM(stock_quantity), 0) FROM inventory_items WHERE inventory_items.product_id = products.id) ${direction}`,
            );
            return;
        }
        query.orderBy(column, direction);
    }

    private async computeFacetCounts(request: HttpContext["request"]): Promise<Record<string, Record<string, number>>> {
        const result: Record<string, Record<string, number>> = {};
        for (const facet of FACET_COUNT_KEYS) {
            const sub = Product.query();
            this.applyListFilters(sub, request, facet);
            const rows = await this.facetCountRows(facet, sub);
            const bucket: Record<string, number> = {};
            for (const row of rows) {
                bucket[String(row.key)] = Number(row.count);
            }
            result[facet] = bucket;
        }
        return result;
    }

    private async facetCountRows(
        facet: (typeof FACET_COUNT_KEYS)[number],
        sub: ReturnType<typeof Product.query>,
    ): Promise<Array<{ key: string | number; count: number }>> {
        const subSql = sub.knexQuery.select("products.id").toString();
        if (facet === "type") {
            return await db
                .from("products")
                .whereIn("id", db.raw(`(${subSql})`))
                .groupBy("type")
                .select(db.raw("type as key"), db.raw("COUNT(*)::int as count"));
        }
        if (facet === "stock_status") {
            return await db
                .from("inventory_items")
                .whereIn("product_id", db.raw(`(${subSql})`))
                .groupBy("stock_status")
                .select(db.raw("stock_status as key"), db.raw("COUNT(DISTINCT product_id)::int as count"));
        }
        if (facet === "catalog_visibility") {
            return await db
                .from("products")
                .whereIn("id", db.raw(`(${subSql})`))
                .groupBy("catalog_visibility")
                .select(db.raw("catalog_visibility as key"), db.raw("COUNT(*)::int as count"));
        }
        if (facet === "category") {
            return await db
                .from("product_category_links")
                .whereIn("product_id", db.raw(`(${subSql})`))
                .groupBy("category_id")
                .select(db.raw("category_id as key"), db.raw("COUNT(DISTINCT product_id)::int as count"));
        }
        if (facet === "tag") {
            return await db
                .from("product_tag_links")
                .whereIn("product_id", db.raw(`(${subSql})`))
                .groupBy("tag_id")
                .select(db.raw("tag_id as key"), db.raw("COUNT(DISTINCT product_id)::int as count"));
        }
        return await db
            .from("product_brand_links")
            .whereIn("product_id", db.raw(`(${subSql})`))
            .groupBy("brand_id")
            .select(db.raw("brand_id as key"), db.raw("COUNT(DISTINCT product_id)::int as count"));
    }

    /**
     * `GET /api/v1/admin/products/counts` — status tab counts under the active filter set
     * (minus the status filter itself). Returns `any`, `publish`, `draft`, `pending`, `private`, `trash`.
     */
    async counts(ctx: HttpContext) {
        const { request } = ctx;
        const totals: Record<string, number> = { any: 0, publish: 0, draft: 0, pending: 0, private: 0, trash: 0 };

        const baseAny = Product.query();
        this.applyListFilters(baseAny, request);
        totals.any = await this.countQuery(baseAny);

        for (const status of ["publish", "draft", "pending", "private"] as const) {
            const q = Product.query();
            this.applyListFilters(q, request);
            q.where("status", status);
            totals[status] = await this.countQuery(q);
        }

        const trashQ = Product.query().whereNotNull("deleted_at");
        totals.trash = await this.countQuery(trashQ);

        return { data: totals };
    }

    private async countQuery(query: ReturnType<typeof Product.query>): Promise<number> {
        const rows = await query.count("* as total");
        const first = rows[0] as Product & { $extras?: { total?: string | number } };
        return Number(first?.$extras?.total ?? 0);
    }

    async show(ctx: HttpContext) {
        const product = await this.reload(ctx.params.id);
        if (!product) {
            return ctx.response.status(404).json({ error: "product_not_found" });
        }
        return resource(
            ProductTransformer.transform(product, ctx.i18n.locale, await this.transformerOptions()).useVariant("forAdmin"),
        );
    }

    /**
     * `GET /admin/products/check-slug?slug=…&locale=…&excludeId=…` — debounced async uniqueness
     * check the detail page hits on blur. The slug column lives on `product_translations`, so we
     * scope by `locale`. `excludeId` lets the edit view skip its own row.
     */
    async checkSlug(ctx: HttpContext) {
        const params = await checkSlugValidator.validate(ctx.request.qs());
        const query = db
            .from("product_translations")
            .where("locale", params.locale)
            .whereRaw("LOWER(slug) = ?", [params.slug.toLowerCase()]);
        if (params.excludeId !== undefined) {
            query.whereNot("product_id", params.excludeId);
        }
        const row = await query.select("product_id").first();
        return { data: { available: !row } };
    }

    async store(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(createProductValidator);
        await this.assertLinkedProductsExist(payload.upsell_ids, payload.cross_sell_ids, payload.grouped_member_ids);
        await this.assertAttributeLinkTermsBelong(payload.attribute_links);
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
            await syncOrderedLinks(trx, "product_upsells", "product_id", row.id, "related_product_id", payload.upsell_ids);
            await syncOrderedLinks(
                trx,
                "product_cross_sells",
                "product_id",
                row.id,
                "related_product_id",
                payload.cross_sell_ids,
            );
            await syncOrderedLinks(
                trx,
                "product_group_members",
                "group_product_id",
                row.id,
                "member_product_id",
                payload.grouped_member_ids,
            );
            await syncProductDownloads(trx, row.id, payload.downloads);
            await syncProductAttributeLinks(trx, row.id, payload.attribute_links);
            return row;
        });
        const reloaded = await this.reload(product.id);
        await CacheInvalidation.productChanged(product.id);
        ctx.response.status(201);
        return resource(
            ProductTransformer.transform(reloaded!, ctx.i18n.locale, await this.transformerOptions()).useVariant("forAdmin"),
        );
    }

    async update(ctx: HttpContext) {
        const product = await Product.query().where("id", ctx.params.id).first();
        if (!product) {
            return ctx.response.status(404).json({ error: "product_not_found" });
        }
        const conflict = this.assertIfMatch(ctx, product);
        if (conflict) return conflict;
        const payload = await ctx.request.validateUsing(updateProductValidator);
        await this.assertLinkedProductsExist(payload.upsell_ids, payload.cross_sell_ids, payload.grouped_member_ids);
        await this.assertAttributeLinkTermsBelong(payload.attribute_links);
        const linkedTouched =
            payload.upsell_ids !== undefined || payload.cross_sell_ids !== undefined || payload.grouped_member_ids !== undefined;
        const downloadsTouched = payload.downloads !== undefined;
        const attributesTouched = payload.attribute_links !== undefined;
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
            await syncOrderedLinks(trx, "product_upsells", "product_id", product.id, "related_product_id", payload.upsell_ids);
            await syncOrderedLinks(
                trx,
                "product_cross_sells",
                "product_id",
                product.id,
                "related_product_id",
                payload.cross_sell_ids,
            );
            await syncOrderedLinks(
                trx,
                "product_group_members",
                "group_product_id",
                product.id,
                "member_product_id",
                payload.grouped_member_ids,
            );
            await syncProductDownloads(trx, product.id, payload.downloads);
            await syncProductAttributeLinks(trx, product.id, payload.attribute_links);
        });
        const reloaded = await this.reload(product.id);
        await CacheInvalidation.productChanged(product.id);
        if (attributesTouched) {
            await recordAudit({
                ctx,
                action: "product.attribute_links.update",
                entityKind: "product",
                entityId: Number(product.id),
            });
        }
        if (linkedTouched) {
            await recordAudit({
                ctx,
                action: "product.linked_products.update",
                entityKind: "product",
                entityId: Number(product.id),
            });
        }
        if (downloadsTouched) {
            await recordAudit({
                ctx,
                action: "product.downloads.update",
                entityKind: "product",
                entityId: Number(product.id),
            });
        }
        return resource(
            ProductTransformer.transform(reloaded!, ctx.i18n.locale, await this.transformerOptions()).useVariant("forAdmin"),
        );
    }

    /**
     * Optimistic concurrency check: when the caller supplies an `If-Match` header containing the
     * `updated_at` value they originally fetched, refuse the write with 409 if the row has
     * changed since. Empty / missing header => no check (back-compat for callers that haven't
     * adopted the contract yet). Returns the 409 response when the check fails, else null.
     */
    private assertIfMatch(ctx: HttpContext, product: Product): unknown {
        const header = ctx.request.header("if-match");
        if (!header) return null;
        const current = product.updatedAt?.toISO();
        if (!current) return null;
        if (header === current) return null;
        return ctx.response.status(409).json({
            errors: [{ message: "product_changed_since_fetch", code: "product_concurrent_edit" }],
            data: {
                id: Number(product.id),
                updated_at: current,
            },
        });
    }

    /**
     * Linked-product ids must reference real, non-trashed products. The validator only checks
     * shape (numbers); we check existence here so the error returns 422 instead of crashing on
     * the FK constraint mid-transaction.
     */
    private async assertLinkedProductsExist(
        upsellIds?: number[],
        crossSellIds?: number[],
        groupedMemberIds?: number[],
    ): Promise<void> {
        const all = [...(upsellIds ?? []), ...(crossSellIds ?? []), ...(groupedMemberIds ?? [])];
        if (all.length === 0) return;
        const unique = Array.from(new Set(all));
        const rows = await Product.query().whereIn("id", unique).whereNull("deleted_at").select("id");
        const found = new Set(rows.map((r) => Number(r.id)));
        const missing = unique.filter((id) => !found.has(id));
        if (missing.length > 0) {
            throw new BusinessRuleException("linked_product_not_found", "linked_product_exists", {
                field: "linked_products",
                missing_ids: missing,
            });
        }
    }

    /**
     * Every `term_id` inside an attribute_link must belong to that link's `attribute_id`. The
     * validator only checks shape; this check guards against cross-attribute term ids planted
     * by a malicious client (or a buggy admin UI). Throws 422 with the offending pairs.
     */
    private async assertAttributeLinkTermsBelong(
        links: { attribute_id: number; term_ids: number[] }[] | undefined,
    ): Promise<void> {
        if (links === undefined || links.length === 0) return;
        const termIds = Array.from(new Set(links.flatMap((l) => l.term_ids)));
        if (termIds.length === 0) return;
        const rows = await ProductAttributeTerm.query().whereIn("id", termIds).select("id", "attribute_id");
        const termAttribute = new Map(rows.map((r) => [Number(r.id), Number(r.attributeId)]));
        const mismatched: { attribute_id: number; term_id: number }[] = [];
        for (const link of links) {
            for (const termId of link.term_ids) {
                const owner = termAttribute.get(termId);
                if (owner === undefined || owner !== link.attribute_id) {
                    mismatched.push({ attribute_id: link.attribute_id, term_id: termId });
                }
            }
        }
        if (mismatched.length > 0) {
            throw new BusinessRuleException("attribute_term_attribute_mismatch", "attribute_link_terms_belong", {
                field: "attribute_links",
                mismatched,
            });
        }
    }

    /**
     * `DELETE /api/v1/admin/products/:id` — soft-delete by default. With `?force=1` hard-deletes
     * after verifying no active orders still reference the product. Active orders are anything not
     * in {cancelled, refunded, failed, draft}.
     */
    async destroy(ctx: HttpContext) {
        const force = String(ctx.request.input("force", ctx.request.qs().force ?? "")) === "1";
        const product = await Product.query().where("id", ctx.params.id).first();
        if (!product) {
            return ctx.response.status(404).json({ error: "product_not_found" });
        }
        if (force) {
            const conflict = await this.assertNotInActiveOrders(Number(product.id));
            if (conflict) {
                return ctx.response.status(409).json({ errors: [{ message: conflict, code: "product_in_use" }] });
            }
            await product.delete();
            await recordAudit({
                ctx,
                action: "product.force_delete",
                entityKind: "product",
                entityId: Number(product.id),
            });
        } else {
            product.deletedAt = DateTime.utc();
            await product.save();
            await recordAudit({
                ctx,
                action: "product.trash",
                entityKind: "product",
                entityId: Number(product.id),
            });
        }
        await CacheInvalidation.productChanged(product.id);
        return ctx.response.status(204);
    }

    /** `POST /api/v1/admin/products/:id/restore` — un-trash a single product. */
    async restore(ctx: HttpContext) {
        const product = await Product.query().where("id", ctx.params.id).whereNotNull("deleted_at").first();
        if (!product) {
            return ctx.response.status(404).json({ error: "product_not_found_or_not_trashed" });
        }
        product.deletedAt = null;
        await product.save();
        await recordAudit({
            ctx,
            action: "product.restore",
            entityKind: "product",
            entityId: Number(product.id),
        });
        await CacheInvalidation.productChanged(product.id);
        const reloaded = await this.reload(product.id);
        return resource(
            ProductTransformer.transform(reloaded!, ctx.i18n.locale, await this.transformerOptions()).useVariant("forAdmin"),
        );
    }

    /** `POST /api/v1/admin/products/restore` — bulk restore. */
    async restoreBatch(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(restoreProductsValidator);
        const restoredIds: number[] = [];
        await withTransaction(async (trx) => {
            for (const id of payload.ids) {
                const row = await Product.query({ client: trx }).where("id", id).whereNotNull("deleted_at").first();
                if (!row) continue;
                row.useTransaction(trx);
                row.deletedAt = null;
                await row.save();
                restoredIds.push(Number(row.id));
            }
        });
        for (const id of restoredIds) {
            await recordAudit({ ctx, action: "product.restore", entityKind: "product", entityId: id });
        }
        await CacheInvalidation.productsChanged(restoredIds);
        return { data: { restored: restoredIds } };
    }

    /**
     * Returns a translated reason string when force-delete is blocked, otherwise null.
     * Pragmatic check: order_line_items has ON DELETE SET NULL, but we still want to keep
     * the live link so the order detail can deep-link back to the product. Refuse if the
     * line item is on an order whose status is in the active set.
     */
    private async assertNotInActiveOrders(productId: number): Promise<string | null> {
        const count = await db
            .from("order_line_items")
            .innerJoin("orders", "orders.id", "order_line_items.order_id")
            .where("order_line_items.product_id", productId)
            .whereIn("orders.status", ACTIVE_ORDER_STATUSES as unknown as string[])
            .count("* as count");
        const n = Number((count[0] as { count: string }).count ?? 0);
        if (n === 0) return null;
        return "product_in_use_by_active_orders";
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
        await CacheInvalidation.productChanged(copy.id);
        ctx.response.status(201);
        return resource(
            ProductTransformer.transform(reloaded!, ctx.i18n.locale, await this.transformerOptions()).useVariant("forAdmin"),
        );
    }

    /**
     * `POST /admin/products/batch` — atomic `{create, update, delete}` batch operation.
     * The `delete` entries support `{ id, force?: true }` for hard-delete; bare numbers still
     * trash the row (back-compat).
     */
    async batch(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(batchProductsValidator);
        const createdIds: number[] = [];
        const updatedIds: number[] = [];
        const deletedIds: number[] = [];
        const forceDeletedIds: number[] = [];
        const skippedForceIds: number[] = [];
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
            for (const entry of payload.delete ?? []) {
                const id = typeof entry === "number" ? entry : Number((entry as { id: number }).id);
                const force = typeof entry === "object" && entry !== null && (entry as { force?: boolean }).force === true;
                if (!Number.isFinite(id) || id <= 0) continue;
                if (force) {
                    const conflict = await this.assertNotInActiveOrders(id);
                    if (conflict) {
                        skippedForceIds.push(id);
                        continue;
                    }
                    await Product.query({ client: trx }).where("id", id).delete();
                    forceDeletedIds.push(id);
                } else {
                    await Product.query({ client: trx })
                        .where("id", id)
                        .whereNull("deleted_at")
                        .update({ deleted_at: DateTime.utc().toSQL() });
                    deletedIds.push(id);
                }
            }
        });
        await CacheInvalidation.productsChanged([...createdIds, ...updatedIds, ...deletedIds, ...forceDeletedIds]);
        return {
            data: {
                created: createdIds,
                updated: updatedIds,
                deleted: deletedIds,
                force_deleted: forceDeletedIds,
                skipped_force: skippedForceIds,
            },
        };
    }

    /**
     * Resolves the cross-controller transformer options — currently just the global low-stock
     * threshold setting. Reads through {@link SettingsService} so the value is cached and a
     * single SQL hit serves every concurrent request until the operator updates the setting.
     */
    private async transformerOptions(): Promise<ProductTransformerOptions> {
        const settings = new SettingsService();
        const defaultLowStockThreshold = await settings.get<number>("inventory", "low_stock_threshold_default", 5);
        return { defaultLowStockThreshold };
    }

    private async reload(id: bigint | number | string): Promise<Product | null> {
        return Product.query()
            .where("id", String(id))
            .preload("translations")
            .preload("images", (q) => q.preload("media"))
            .preload("variations", (q) => q.preload("translations").preload("attributePins"))
            .preload("attributeLinks", (q) => q.preload("terms"))
            .preload("categories", (q) => q.preload("translations"))
            .preload("tags", (q) => q.preload("translations"))
            .preload("brands", (q) => q.preload("translations"))
            .preload("inventoryItems")
            .preload("downloads", (q) => q.preload("media").orderBy("position"))
            .preload("upsells", (q) => q.pivotColumns(["position"]))
            .preload("crossSells", (q) => q.pivotColumns(["position"]))
            .preload("groupedMembers", (q) => q.pivotColumns(["position"]))
            .first();
    }
}

/**
 * Truthy check for boolean-shaped query params. Accepts `1`, `"1"`, `"true"`, `true`, etc.
 * The SDK serializes booleans as the string `"true"`, but curl + form-encoded clients tend to
 * send `"1"` — coerce both forms to a real boolean.
 */
function truthy(value: unknown): boolean {
    if (value === true) return true;
    if (value === false || value === null || value === undefined) return false;
    const s = String(value).toLowerCase();
    return s === "1" || s === "true" || s === "yes" || s === "on";
}

function assignProductFields(row: Product, payload: Record<string, unknown>): void {
    if (payload.type !== undefined) row.type = payload.type as string;
    if (payload.sku !== undefined) row.sku = (payload.sku as string | null) ?? null;
    if (payload.gtin !== undefined) (row as unknown as { gtin: string | null }).gtin = (payload.gtin as string | null) ?? null;
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
    if (payload.pos_available !== undefined) {
        (row as unknown as { posAvailable: boolean }).posAvailable = !!payload.pos_available;
    }
    if (payload.default_variation_id !== undefined) {
        (row as unknown as { defaultVariationId: number | null }).defaultVariationId =
            (payload.default_variation_id as number | null) ?? null;
    }
}
