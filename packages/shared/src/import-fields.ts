/**
 * Catalogue of fields the product importer can write into, the column-name aliases that auto-map to
 * each field, and the value type used for validation + anomaly detection.
 *
 * This module is the single source of truth for both the API (server-side mapping + validation) and
 * the admin UI (mapping dropdown grouping, type chips, sample-preview formatting). Adding a new
 * field happens once here and ripples to both consumers — never duplicate the alias list.
 *
 * Labels intentionally live in each app's i18n catalogue keyed by `Products.import.fields.<key>` so
 * Persian copy stays under the same review process as the rest of the admin UI.
 */

export type ImportFieldGroup =
    | "basic"
    | "pricing"
    | "stock"
    | "shipping"
    | "taxonomy"
    | "media"
    | "linked"
    | "attributes"
    | "seo";

export type ImportFieldType = "text" | "number" | "boolean" | "date" | "url" | "enum" | "list";

export interface ImportField {
    /** Stable machine key. Used in mapping JSON and i18n. */
    key: string;
    group: ImportFieldGroup;
    type: ImportFieldType;
    /**
     * `"create"` → required on new-product rows (anomaly detector warns when missing on a
     * create row). `"update"` → required on update rows. `undefined` → optional everywhere.
     */
    required?: "create" | "update";
    /**
     * Lower-cased aliases that auto-match this field. Headers are normalized (digits + whitespace +
     * BOM stripped) before lookup, so aliases here should be the cleaned form.
     */
    aliases: string[];
    /** For `enum` typed fields — the accepted value set. */
    enumValues?: readonly string[];
}

export const IMPORT_FIELDS: readonly ImportField[] = [
    {
        key: "sku",
        group: "basic",
        type: "text",
        required: "update",
        aliases: ["sku", "skucode", "stockkeepingunit", "کد", "شناسه", "کدمحصول", "کدکالا", "بارکد"],
    },
    {
        key: "name",
        group: "basic",
        type: "text",
        required: "create",
        aliases: ["name", "title", "productname", "نام", "عنوان", "نامحصول", "نامکالا"],
    },
    {
        key: "type",
        group: "basic",
        type: "enum",
        enumValues: ["simple", "variable", "grouped", "external"],
        aliases: ["type", "producttype", "نوع", "نوعمحصول"],
    },
    {
        key: "status",
        group: "basic",
        type: "enum",
        enumValues: ["publish", "draft", "pending", "private"],
        aliases: ["status", "وضعیت", "حالت"],
    },
    {
        key: "short_description",
        group: "basic",
        type: "text",
        aliases: ["shortdescription", "summary", "excerpt", "توضیحاتکوتاه", "خلاصه"],
    },
    {
        key: "description",
        group: "basic",
        type: "text",
        aliases: ["description", "longdescription", "body", "توضیحات", "توضیحاتکامل"],
    },
    {
        key: "visibility",
        group: "basic",
        type: "enum",
        enumValues: ["visible", "catalog", "search", "hidden"],
        aliases: ["visibility", "catalogvisibility", "قابلیتمشاهده", "نمایش"],
    },
    {
        key: "featured",
        group: "basic",
        type: "boolean",
        aliases: ["featured", "isfeatured", "ویژه", "محصولویژه"],
    },
    {
        key: "allow_reviews",
        group: "basic",
        type: "boolean",
        aliases: ["allowreviews", "reviewsallowed", "دیدگاه", "اجازهدیدگاه", "نظرات"],
    },
    {
        key: "purchase_note",
        group: "basic",
        type: "text",
        aliases: ["purchasenote", "یادداشتخرید", "یاددداشت"],
    },

    {
        key: "regular_price",
        group: "pricing",
        type: "number",
        required: "create",
        aliases: ["regularprice", "price", "priceregular", "قیمت", "قیمتاصلی", "قیمتعادی"],
    },
    {
        key: "sale_price",
        group: "pricing",
        type: "number",
        aliases: ["saleprice", "discountprice", "قیمتویژه", "قیمتفروش", "قیمتتخفیف"],
    },
    {
        key: "sale_price_start",
        group: "pricing",
        type: "date",
        aliases: ["salepricestart", "salestart", "datesalefrom", "شروعتخفیف", "شروعفروش"],
    },
    {
        key: "sale_price_end",
        group: "pricing",
        type: "date",
        aliases: ["salepriceend", "saleend", "datesaleto", "پایانتخفیف", "پایانفروش"],
    },
    {
        key: "tax_status",
        group: "pricing",
        type: "enum",
        enumValues: ["taxable", "shipping", "none"],
        aliases: ["taxstatus", "وضعیتمالیات"],
    },
    {
        key: "tax_class",
        group: "pricing",
        type: "text",
        aliases: ["taxclass", "کلاسمالیاتی"],
    },

    {
        key: "manage_stock",
        group: "stock",
        type: "boolean",
        aliases: ["managestock", "stockmanagement", "مدیریتموجودی"],
    },
    {
        key: "stock_quantity",
        group: "stock",
        type: "number",
        aliases: ["stock", "stockquantity", "quantity", "qty", "موجودی", "تعداد", "مقدار"],
    },
    {
        key: "stock_status",
        group: "stock",
        type: "enum",
        enumValues: ["instock", "outofstock", "onbackorder"],
        aliases: ["stockstatus", "وضعیتموجودی"],
    },
    {
        key: "backorders_allowed",
        group: "stock",
        type: "boolean",
        aliases: ["backorders", "backordersallowed", "پیشخرید"],
    },
    {
        key: "sold_individually",
        group: "stock",
        type: "boolean",
        aliases: ["soldindividually", "تکفروشی", "فروشتکی"],
    },

    {
        key: "weight",
        group: "shipping",
        type: "number",
        aliases: ["weight", "وزن"],
    },
    {
        key: "length",
        group: "shipping",
        type: "number",
        aliases: ["length", "طول"],
    },
    {
        key: "width",
        group: "shipping",
        type: "number",
        aliases: ["width", "عرض"],
    },
    {
        key: "height",
        group: "shipping",
        type: "number",
        aliases: ["height", "ارتفاع"],
    },
    {
        key: "shipping_class",
        group: "shipping",
        type: "text",
        aliases: ["shippingclass", "کلاسحملونقل", "کلاسارسال"],
    },

    {
        key: "categories",
        group: "taxonomy",
        type: "list",
        aliases: ["categories", "category", "cat", "دستهبندی", "دستهبندیها", "دسته"],
    },
    {
        key: "tags",
        group: "taxonomy",
        type: "list",
        aliases: ["tags", "tag", "برچسب", "برچسبها", "تگ"],
    },
    {
        key: "brand",
        group: "taxonomy",
        type: "text",
        aliases: ["brand", "manufacturer", "برند", "سازنده"],
    },

    {
        key: "images",
        group: "media",
        type: "list",
        aliases: ["images", "image", "imageurls", "photos", "تصاویر", "تصویر", "عکس", "عکسها"],
    },

    {
        key: "parent_sku",
        group: "linked",
        type: "text",
        aliases: ["parentsku", "parent", "skuparent", "والد", "اسکیووالد"],
    },
    {
        key: "upsells",
        group: "linked",
        type: "list",
        aliases: ["upsells", "upsell", "محصولاتپیشنهادی"],
    },
    {
        key: "cross_sells",
        group: "linked",
        type: "list",
        aliases: ["crosssells", "crosssell", "محصولاتمرتبط"],
    },
    {
        key: "external_url",
        group: "linked",
        type: "url",
        aliases: ["externalurl", "url", "productlink", "آدرس", "لینک"],
    },
    {
        key: "button_text",
        group: "linked",
        type: "text",
        aliases: ["buttontext", "متندکمه"],
    },

    {
        key: "menu_order",
        group: "basic",
        type: "number",
        aliases: ["menuorder", "order", "sortorder", "ترتیب"],
    },
] as const;

/** Lookup `key → field` for fast resolution by mapping JSON. */
export const IMPORT_FIELD_BY_KEY: ReadonlyMap<string, ImportField> = new Map(
    IMPORT_FIELDS.map((field) => [field.key, field]),
);

/**
 * Normalize a CSV header for alias matching: strip BOM, lowercase, drop non-letter/digit (keeps
 * Persian letters and ASCII letters/digits). Whitespace, dashes, underscores, dots all collapse.
 */
export function normalizeHeader(header: string): string {
    return header
        .replace(/^﻿/, "")
        .trim()
        .toLowerCase()
        .replace(/[\s_\-.()[\]{}«»"'`*\/\\]+/g, "");
}

/**
 * Find the import field a header maps to via alias matching. Returns `null` when no alias matches
 * (the UI will then leave the row's destination dropdown at `"don't import"`).
 */
export function matchHeader(header: string): ImportField | null {
    const normalized = normalizeHeader(header);
    if (normalized === "") return null;
    for (const field of IMPORT_FIELDS) {
        if (field.key === normalized) return field;
        if (field.aliases.includes(normalized)) return field;
    }
    return null;
}

/**
 * Stable header-set fingerprint used to look up per-shape mapping presets. Headers are normalized
 * + sorted so column re-ordering between exports doesn't break preset matching.
 */
export function hashHeaderSet(headers: readonly string[]): string {
    const normalized = headers.map(normalizeHeader).filter((h) => h !== "");
    normalized.sort();
    const joined = normalized.join("|");
    return fnv1a(joined);
}

function fnv1a(input: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
}
