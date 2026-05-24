import db from "@adonisjs/lucid/services/db";

import Product from "#models/product";

/**
 * Single source of truth for every filter the product exporter (and its `/count` + `/preview`
 * siblings) understands. The wizard, the SSE runner, and the live-count chip all call into here
 * with the same `ExportFilters` shape — that's how every filter dimension the UI exposes stays in
 * lockstep with the backend (no "filter that shows up in the count endpoint but the runner forgot
 * about" class of bug).
 *
 * Filter semantics:
 *  - `status` / `type` / `stock_status` / `tax_class` / `shipping_class` — IN-list constraints.
 *  - `categories` — restricts to products linked to *any* of the supplied category ids. With
 *    `include_descendant_categories=true` the set is expanded via a recursive CTE so the operator
 *    can scope to a whole tree branch (`Footwear > *`) with a single picker click.
 *  - `brands`, `tags` — IN-list joins. `tags_match: "all"` flips to AND-style with one EXISTS
 *    per tag id, so the operator can demand intersection rather than union.
 *  - `low_stock` — products whose inventory `stock_quantity <= low_stock_threshold` (default 5).
 *  - `price_min` / `price_max` — bounds on `regular_price` (Rial minor units).
 *  - `on_sale` — `sale_price IS NOT NULL` AND within active sale window when those columns are
 *    populated.
 *  - `featured` — direct boolean.
 *  - `has_images` — EXISTS a `product_images` row.
 *  - `has_variations` — `type = 'variable'` plus EXISTS a `product_variations` row.
 *  - `created_after` / `_before` / `updated_*` — half-open date ranges on the eponymous columns.
 *  - `sku_pattern` — `*` → `%`, `?` → `_` for SQL LIKE.
 *  - `search` — fuzzy match against translations.name + products.sku.
 *  - `attributes` — for each pair, EXISTS a link row whose chosen-term ids intersect the supplied
 *    `term_ids`. Multiple attribute pairs are AND-combined (color=red AND size=XL).
 *  - `ids` — explicit allow-list (used by the bulk-action entry from the products list).
 *  - `with_trashed` — opts into soft-deleted rows; default is to hide them.
 */
export interface ExportFilters {
    status?: string[];
    type?: string[];
    categories?: number[];
    include_descendant_categories?: boolean;
    brands?: number[];
    tags?: number[];
    tags_match?: "any" | "all";
    stock_status?: string[];
    low_stock?: boolean;
    low_stock_threshold?: number;
    price_min?: number;
    price_max?: number;
    on_sale?: boolean;
    featured?: boolean;
    has_images?: boolean;
    has_variations?: boolean;
    /** Not a filter, but rides the same envelope — runner uses it to emit variation rows. */
    include_variations?: boolean;
    tax_class?: string[];
    shipping_class?: string[];
    created_after?: string;
    created_before?: string;
    updated_after?: string;
    updated_before?: string;
    sku_pattern?: string;
    search?: string;
    attributes?: Array<{ attribute_id: number; term_ids: number[] }>;
    ids?: number[];
    with_trashed?: boolean;
}

/**
 * Build a Lucid query against `products` that applies the given filter set. The caller decides
 * what to do with it — `.count()` for the count endpoint, `.limit(5).preload(...)` for the
 * preview endpoint, `.chunk(...)` for the runner. Return type is inferred so the caller keeps
 * the full `ModelQueryBuilderContract<typeof Product>` API surface (preload, paginate, etc.).
 */
export function buildExportQuery(filters: ExportFilters) {
    const q = Product.query();

    if (filters.with_trashed !== true) q.whereNull("deleted_at");

    if (filters.status !== undefined && filters.status.length > 0) {
        q.whereIn("status", filters.status);
    }
    if (filters.type !== undefined && filters.type.length > 0) {
        q.whereIn("type", filters.type);
    }
    if (filters.featured === true) q.where("featured", true);

    const ids = filters.ids;
    if (ids !== undefined && ids.length > 0) q.whereIn("id", ids);

    applyCategoriesFilter(q, filters);
    applyBrandsFilter(q, filters);
    applyTagsFilter(q, filters);
    applyInventoryFilter(q, filters);
    applyPriceFilter(q, filters);
    applyOnSaleFilter(q, filters);
    applyHasImagesFilter(q, filters);
    applyHasVariationsFilter(q, filters);
    applyTaxClassFilter(q, filters);
    applyShippingClassFilter(q, filters);
    applyDateRanges(q, filters);
    applySkuPattern(q, filters);
    applySearch(q, filters);
    applyAttributesFilter(q, filters);

    return q;
}

type ProductQuery = ReturnType<typeof buildExportQuery>;

function applyCategoriesFilter(q: ProductQuery, filters: ExportFilters): void {
    const cats = filters.categories;
    if (cats === undefined || cats.length === 0) return;

    if (filters.include_descendant_categories !== true) {
        q.whereIn("id", (sub) => sub.select("product_id").from("product_category_links").whereIn("category_id", cats));
        return;
    }

    /**
     * Recursive CTE: `WITH RECURSIVE descendants AS (SELECT id FROM product_categories WHERE
     * id IN (...) UNION SELECT pc.id FROM product_categories pc JOIN descendants d ON pc.parent_id
     * = d.id)` — gives us every descendant of the supplied roots. Postgres-specific but the rest
     * of the schema is too, so no portability hit.
     */
    const placeholders = cats.map(() => "?").join(",");
    q.whereIn("id", (sub) => {
        sub.select("product_id")
            .from("product_category_links")
            .whereIn(
                "category_id",
                db.raw(
                    `(WITH RECURSIVE descendants AS (
                        SELECT id FROM product_categories WHERE id IN (${placeholders})
                        UNION
                        SELECT pc.id FROM product_categories pc
                        JOIN descendants d ON pc.parent_id = d.id
                    ) SELECT id FROM descendants)`,
                    cats,
                ) as unknown as number[],
            );
    });
}

function applyBrandsFilter(q: ProductQuery, filters: ExportFilters): void {
    const brands = filters.brands;
    if (brands === undefined || brands.length === 0) return;
    q.whereIn("id", (sub) => sub.select("product_id").from("product_brand_links").whereIn("brand_id", brands));
}

function applyTagsFilter(q: ProductQuery, filters: ExportFilters): void {
    const tags = filters.tags;
    if (tags === undefined || tags.length === 0) return;
    if (filters.tags_match !== "all") {
        q.whereIn("id", (sub) => sub.select("product_id").from("product_tag_links").whereIn("tag_id", tags));
        return;
    }
    /** AND-style: one EXISTS per tag id so the product must carry every tag in the list. */
    for (const tagId of tags) {
        q.whereExists((sub) =>
            sub
                .select(db.raw("1"))
                .from("product_tag_links")
                .whereRaw("product_tag_links.product_id = products.id")
                .where("tag_id", tagId),
        );
    }
}

function applyInventoryFilter(q: ProductQuery, filters: ExportFilters): void {
    const statuses = filters.stock_status;
    const lowStock = filters.low_stock === true;
    if ((statuses === undefined || statuses.length === 0) && !lowStock) return;
    q.whereIn("id", (sub) => {
        const inv = sub.select("product_id").from("inventory_items");
        if (statuses !== undefined && statuses.length > 0) inv.whereIn("stock_status", statuses);
        if (lowStock) {
            const threshold = filters.low_stock_threshold ?? 5;
            inv.where("stock_quantity", "<=", threshold);
        }
        return inv;
    });
}

function applyPriceFilter(q: ProductQuery, filters: ExportFilters): void {
    if (filters.price_min !== undefined) q.where("regular_price", ">=", filters.price_min);
    if (filters.price_max !== undefined) q.where("regular_price", "<=", filters.price_max);
}

function applyOnSaleFilter(q: ProductQuery, filters: ExportFilters): void {
    if (filters.on_sale !== true) return;
    q.whereNotNull("sale_price");
    /** Tolerate NULL sale windows (always-on sale). When windows are set, both ends must include now. */
    q.where((inner) => {
        inner.whereNull("sale_starts_at").orWhere("sale_starts_at", "<=", new Date().toISOString());
    });
    q.where((inner) => {
        inner.whereNull("sale_ends_at").orWhere("sale_ends_at", ">=", new Date().toISOString());
    });
}

function applyHasImagesFilter(q: ProductQuery, filters: ExportFilters): void {
    if (filters.has_images !== true) return;
    q.whereExists((sub) => sub.select(db.raw("1")).from("product_images").whereRaw("product_images.product_id = products.id"));
}

function applyHasVariationsFilter(q: ProductQuery, filters: ExportFilters): void {
    if (filters.has_variations !== true) return;
    q.where("type", "variable");
    q.whereExists((sub) =>
        sub
            .select(db.raw("1"))
            .from("product_variations")
            .whereRaw("product_variations.product_id = products.id")
            .whereNull("deleted_at"),
    );
}

function applyTaxClassFilter(q: ProductQuery, filters: ExportFilters): void {
    const slugs = filters.tax_class;
    if (slugs === undefined || slugs.length === 0) return;
    q.whereIn("tax_class_id", (sub) =>
        sub
            .select("id")
            .from("tax_classes")
            .whereIn(
                db.raw("LOWER(slug)") as unknown as string,
                slugs.map((s) => s.toLowerCase()),
            ),
    );
}

function applyShippingClassFilter(q: ProductQuery, filters: ExportFilters): void {
    const slugs = filters.shipping_class;
    if (slugs === undefined || slugs.length === 0) return;
    q.whereIn("shipping_class_id", (sub) =>
        sub
            .select("id")
            .from("product_shipping_classes")
            .whereIn(
                db.raw("LOWER(slug)") as unknown as string,
                slugs.map((s) => s.toLowerCase()),
            ),
    );
}

function applyDateRanges(q: ProductQuery, filters: ExportFilters): void {
    if (filters.created_after !== undefined) q.where("created_at", ">=", filters.created_after);
    if (filters.created_before !== undefined) q.where("created_at", "<=", filters.created_before);
    if (filters.updated_after !== undefined) q.where("updated_at", ">=", filters.updated_after);
    if (filters.updated_before !== undefined) q.where("updated_at", "<=", filters.updated_before);
}

function applySkuPattern(q: ProductQuery, filters: ExportFilters): void {
    const raw = filters.sku_pattern;
    if (raw === undefined || raw.trim() === "") return;
    /** `*` → `%`, `?` → `_` so operators write glob patterns the wizard hint advertises. */
    const escaped = raw.replace(/[\\%_]/g, "\\$&");
    const likePattern = escaped.replace(/\*/g, "%").replace(/\?/g, "_");
    q.whereILike("sku", likePattern);
}

function applySearch(q: ProductQuery, filters: ExportFilters): void {
    const needle = filters.search;
    if (needle === undefined || needle.trim() === "") return;
    const like = `%${needle}%`;
    q.where((inner) => {
        inner
            .whereILike("sku", like)
            .orWhereIn("id", (sub) => sub.select("product_id").from("product_translations").whereILike("name", like))
            .orWhereIn("id", (sub) => sub.select("product_id").from("product_translations").whereILike("description", like));
    });
}

function applyAttributesFilter(q: ProductQuery, filters: ExportFilters): void {
    const pairs = filters.attributes;
    if (pairs === undefined || pairs.length === 0) return;
    /**
     * Per pair: EXISTS a link row whose `attribute_id` matches AND whose chosen-term ids
     * intersect the supplied `term_ids`. Multiple pairs are AND-combined — `color=red AND
     * size=XL` returns only products that satisfy both.
     */
    for (const pair of pairs) {
        if (pair.term_ids.length === 0) continue;
        q.whereExists((sub) =>
            sub
                .select(db.raw("1"))
                .from("product_attribute_links")
                .whereRaw("product_attribute_links.product_id = products.id")
                .where("product_attribute_links.attribute_id", pair.attribute_id)
                .whereIn("id", (inner) =>
                    inner
                        .select("product_attribute_link_id")
                        .from("product_attribute_link_terms")
                        .whereIn("attribute_term_id", pair.term_ids),
                ),
        );
    }
}
