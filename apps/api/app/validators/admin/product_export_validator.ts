import vine from "@vinejs/vine";

/**
 * Validators for the admin product-exporter endpoints. The filter schema is shared by `count`,
 * `preview`, `start`, and the presets endpoints so the entire surface speaks the same vocabulary
 * and any new filter dimension ships to all of them at once.
 *
 * Persian-first nicety: VineJS' string coercion accepts plain numerics and stringified ones, so
 * the URL-encoded query params the wizard sends (`?status=publish&status=draft&…`) deserialize
 * without per-endpoint bespoke parsing.
 */

const PRODUCT_STATUSES = ["publish", "draft", "pending", "private"] as const;
const PRODUCT_TYPES = ["simple", "variable", "grouped", "external"] as const;
const STOCK_STATUSES = ["instock", "outofstock", "onbackorder"] as const;
const TAGS_MATCH = ["any", "all"] as const;
const EXPORT_FORMATS = ["csv", "json"] as const;
const DELIMITERS = [",", ";", "\t"] as const;
const ENCODINGS = ["utf-8-bom", "utf-8", "windows-1256"] as const;
const LINE_ENDINGS = ["\n", "\r\n"] as const;
const DIGIT_STYLES = ["ascii", "persian"] as const;
const DATE_FORMATS = ["iso", "jalali", "ddmmyyyy"] as const;
const MONEY_FORMATS = ["minor", "major"] as const;
const COMPRESS_MODES = ["auto", "always", "never"] as const;
const HEADER_LANGUAGES = ["en", "fa"] as const;
const META_STRATEGIES = ["all", "min_count", "selected"] as const;

const SCOPE_VALUES = ["all", "filter", "selected", "preset"] as const;

const attributeFilterSchema = vine.object({
    attribute_id: vine.number().positive(),
    term_ids: vine.array(vine.number().positive()),
});

/**
 * Shared filter envelope — every endpoint that touches matching products reads the same shape.
 * All fields optional; absent = no constraint on that dimension. Multi-value fields are arrays.
 */
const filterFields = {
    status: vine.array(vine.enum(PRODUCT_STATUSES)).optional(),
    type: vine.array(vine.enum(PRODUCT_TYPES)).optional(),
    categories: vine.array(vine.number().positive()).optional(),
    include_descendant_categories: vine.boolean().optional(),
    brands: vine.array(vine.number().positive()).optional(),
    tags: vine.array(vine.number().positive()).optional(),
    tags_match: vine.enum(TAGS_MATCH).optional(),
    stock_status: vine.array(vine.enum(STOCK_STATUSES)).optional(),
    low_stock: vine.boolean().optional(),
    low_stock_threshold: vine.number().min(0).max(1_000_000).optional(),
    price_min: vine.number().min(0).optional(),
    price_max: vine.number().min(0).optional(),
    on_sale: vine.boolean().optional(),
    featured: vine.boolean().optional(),
    has_images: vine.boolean().optional(),
    has_variations: vine.boolean().optional(),
    include_variations: vine.boolean().optional(),
    tax_class: vine.array(vine.string().trim().maxLength(120)).optional(),
    shipping_class: vine.array(vine.string().trim().maxLength(120)).optional(),
    created_after: vine.string().trim().optional(),
    created_before: vine.string().trim().optional(),
    updated_after: vine.string().trim().optional(),
    updated_before: vine.string().trim().optional(),
    sku_pattern: vine.string().trim().maxLength(120).optional(),
    search: vine.string().trim().maxLength(200).optional(),
    attributes: vine.array(attributeFilterSchema).maxLength(50).optional(),
    ids: vine.array(vine.number().positive()).maxLength(10_000).optional(),
    with_trashed: vine.boolean().optional(),
};

/** Used by GET `/count` and GET `/preview` — query-string variant. */
export const exportFiltersValidator = vine.compile(vine.object(filterFields));

/**
 * `POST /api/v1/admin/products/export/start` — kicks off the runner. Extends the filter envelope
 * with column selection + format/delivery options + an optional preset to save the profile under.
 */
export const startExportValidator = vine.compile(
    vine.object({
        ...filterFields,
        scope: vine.enum(SCOPE_VALUES).optional(),
        columns: vine.array(vine.string().trim().minLength(1).maxLength(120)).minLength(1).maxLength(200),
        header_language: vine.enum(HEADER_LANGUAGES).optional(),
        include_meta: vine.boolean().optional(),
        meta_strategy: vine.enum(META_STRATEGIES).optional(),
        meta_min_count: vine.number().min(1).max(1_000_000).optional(),
        meta_keys: vine.array(vine.string().trim().maxLength(120)).optional(),
        show_hidden_meta: vine.boolean().optional(),
        format: vine.enum(EXPORT_FORMATS).optional(),
        delimiter: vine.enum(DELIMITERS).optional(),
        enclosure: vine.string().trim().maxLength(1).optional(),
        encoding: vine.enum(ENCODINGS).optional(),
        line_ending: vine.enum(LINE_ENDINGS).optional(),
        digit_style: vine.enum(DIGIT_STYLES).optional(),
        date_format: vine.enum(DATE_FORMATS).optional(),
        money_format: vine.enum(MONEY_FORMATS).optional(),
        compress: vine.enum(COMPRESS_MODES).optional(),
        redact_pii: vine.boolean().optional(),
        save_as_preset: vine.boolean().optional(),
        preset_name: vine.string().trim().minLength(1).maxLength(200).optional(),
        preset_id: vine.number().positive().optional(),
    }),
);

/** `GET /api/v1/admin/products/export/preview` — same as filters plus the selected columns. */
export const previewExportValidator = vine.compile(
    vine.object({
        ...filterFields,
        columns: vine.array(vine.string().trim().minLength(1).maxLength(120)).minLength(1).maxLength(200),
        header_language: vine.enum(HEADER_LANGUAGES).optional(),
        digit_style: vine.enum(DIGIT_STYLES).optional(),
        date_format: vine.enum(DATE_FORMATS).optional(),
        money_format: vine.enum(MONEY_FORMATS).optional(),
    }),
);

/** `GET /api/v1/admin/products/export/history` — paginated history with optional filters. */
export const exportHistoryQueryValidator = vine.compile(
    vine.object({
        page: vine.number().positive().optional(),
        per_page: vine.number().range([1, 200]).optional(),
        status: vine.enum(["queued", "running", "completed", "completed_with_errors", "failed", "cancelled"] as const).optional(),
        user_id: vine.number().positive().optional(),
        from: vine.string().trim().optional(),
        to: vine.string().trim().optional(),
    }),
);

/** Preset CRUD body — same shape used for both create and full update. */
export const presetUpsertValidator = vine.compile(
    vine.object({
        name: vine.string().trim().minLength(1).maxLength(200),
        filters: vine.record(vine.any()),
        columns: vine.array(vine.string().trim().minLength(1).maxLength(120)).minLength(1).maxLength(200),
        format_options: vine.record(vine.any()).optional(),
        is_default: vine.boolean().optional(),
    }),
);

/** Distinct-meta-keys query — optional scope filters narrow the key list to the matched set. */
export const distinctMetaKeysValidator = vine.compile(
    vine.object({
        ...filterFields,
        show_hidden: vine.boolean().optional(),
        search: vine.string().trim().maxLength(200).optional(),
    }),
);

/** Signed-URL download — token + expiry come from the query string. */
export const downloadExportValidator = vine.compile(
    vine.object({
        token: vine.string().trim().minLength(8).maxLength(256),
    }),
);
