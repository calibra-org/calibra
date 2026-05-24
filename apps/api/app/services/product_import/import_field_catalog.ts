/**
 * Field catalogue + header-alias resolver, kept in lock-step with
 * `packages/shared/src/import-fields.ts`. The admin UI reads its copy from `@calibra/shared` for
 * the mapping dropdown; the api reads from here for server-side validation + auto-mapping. They
 * MUST agree on `key`, `group`, `type`, and the `aliases` list — `tests/functional/admin/
 * product_imports.spec.ts` includes a contract test that loads both files and asserts equality
 * for the subset that lives on both sides.
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
    key: string;
    group: ImportFieldGroup;
    type: ImportFieldType;
    required?: "create" | "update";
    aliases: string[];
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
    { key: "featured", group: "basic", type: "boolean", aliases: ["featured", "isfeatured", "ویژه", "محصولویژه"] },
    {
        key: "allow_reviews",
        group: "basic",
        type: "boolean",
        aliases: ["allowreviews", "reviewsallowed", "دیدگاه", "اجازهدیدگاه", "نظرات"],
    },
    { key: "purchase_note", group: "basic", type: "text", aliases: ["purchasenote", "یادداشتخرید", "یاددداشت"] },
    { key: "menu_order", group: "basic", type: "number", aliases: ["menuorder", "order", "sortorder", "ترتیب"] },

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
    { key: "tax_class", group: "pricing", type: "text", aliases: ["taxclass", "کلاسمالیاتی"] },

    { key: "manage_stock", group: "stock", type: "boolean", aliases: ["managestock", "stockmanagement", "مدیریتموجودی"] },
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
    { key: "backorders_allowed", group: "stock", type: "boolean", aliases: ["backorders", "backordersallowed", "پیشخرید"] },
    { key: "sold_individually", group: "stock", type: "boolean", aliases: ["soldindividually", "تکفروشی", "فروشتکی"] },

    { key: "weight", group: "shipping", type: "number", aliases: ["weight", "وزن"] },
    { key: "length", group: "shipping", type: "number", aliases: ["length", "طول"] },
    { key: "width", group: "shipping", type: "number", aliases: ["width", "عرض"] },
    { key: "height", group: "shipping", type: "number", aliases: ["height", "ارتفاع"] },
    { key: "shipping_class", group: "shipping", type: "text", aliases: ["shippingclass", "کلاسحملونقل", "کلاسارسال"] },

    {
        key: "categories",
        group: "taxonomy",
        type: "list",
        aliases: ["categories", "category", "cat", "دستهبندی", "دستهبندیها", "دسته"],
    },
    { key: "tags", group: "taxonomy", type: "list", aliases: ["tags", "tag", "برچسب", "برچسبها", "تگ"] },
    { key: "brand", group: "taxonomy", type: "text", aliases: ["brand", "manufacturer", "برند", "سازنده"] },

    {
        key: "images",
        group: "media",
        type: "list",
        aliases: ["images", "image", "imageurls", "photos", "تصاویر", "تصویر", "عکس", "عکسها"],
    },

    { key: "parent_sku", group: "linked", type: "text", aliases: ["parentsku", "parent", "skuparent", "والد", "اسکیووالد"] },
    { key: "upsells", group: "linked", type: "list", aliases: ["upsells", "upsell", "محصولاتپیشنهادی"] },
    { key: "cross_sells", group: "linked", type: "list", aliases: ["crosssells", "crosssell", "محصولاتمرتبط"] },
    { key: "external_url", group: "linked", type: "url", aliases: ["externalurl", "url", "productlink", "آدرس", "لینک"] },
    { key: "button_text", group: "linked", type: "text", aliases: ["buttontext", "متندکمه"] },
] as const;

/** O(1) field lookup by stable key. */
export const IMPORT_FIELD_BY_KEY: ReadonlyMap<string, ImportField> = new Map(IMPORT_FIELDS.map((f) => [f.key, f]));

/**
 * Normalize a CSV header for alias matching: strip BOM, lowercase, drop punctuation/whitespace.
 * Keeps letters (Persian + ASCII) and digits — everything else collapses so `"Regular price"`,
 * `"regular_price"`, `"REGULAR-PRICE"` all hash to the same key.
 */
export function normalizeHeader(header: string): string {
    return header
        .replace(/^﻿/, "")
        .trim()
        .toLowerCase()
        .replace(/[\s_\-.()[\]{}«»"'`*/\\]+/g, "");
}

/** Find the import field a header maps to via alias lookup. Returns `null` when no alias matches. */
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
 * Build the per-shape header-set fingerprint used by `product_import_mapping_presets.header_hash`.
 * Headers are normalized + sorted so re-ordering between exports doesn't break preset matching.
 */
export function hashHeaderSet(headers: readonly string[]): string {
    const normalized = headers.map(normalizeHeader).filter((h) => h !== "");
    normalized.sort();
    return fnv1a(normalized.join("|"));
}

function fnv1a(input: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
}

/** Auto-mapping suggestion: `{ csv_header: field_key | null }`. */
export function suggestMapping(headers: readonly string[]): Record<string, string | null> {
    const out: Record<string, string | null> = {};
    for (const h of headers) {
        const field = matchHeader(h);
        out[h] = field?.key ?? null;
    }
    return out;
}
