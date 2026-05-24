import jalaali from "jalaali-js";

import { toPersianDigits } from "#services/product_import/cell_normalizer";
import { IMPORT_FIELD_BY_KEY } from "#services/product_import/import_field_catalog";

/**
 * Build the flat per-row record the row-emitter writes to CSV. The shape is a Record keyed by the
 * `IMPORT_FIELDS` field key, so the row order in the output file is whatever order the column
 * picker chose — the emitter just iterates `columns` in order.
 *
 * This is the INVERSE of `row_projector.ts` (the importer's reader). The exporter has to write
 * values back in the same format the importer accepts so the round-trip is lossless when the
 * default format options are kept.
 *
 * Format options surface here:
 *  - `date_format`: `"iso"` (YYYY-MM-DD) | `"jalali"` (YYYY/MM/DD) | `"ddmmyyyy"`.
 *  - `digit_style`: `"ascii"` (default) | `"persian"` (visually pretty but breaks re-import; the
 *    importer would re-translate them, so it's still safe round-trip but only via the importer's
 *    normalizer).
 *  - `money_format`: `"minor"` (Rial integer, the storage form — default, round-trip safe) |
 *    `"major"` (Toman string with the Persian thousand separator).
 */

export interface ExportFormatOptions {
    digit_style?: "ascii" | "persian";
    date_format?: "iso" | "jalali" | "ddmmyyyy";
    money_format?: "minor" | "major";
}

/**
 * Loose product shape the resolver consumes. We don't type against the Lucid model because the
 * runner builds a hand-rolled `Record<string, unknown>` from preload results to keep the
 * iteration footprint small (no Lucid hydration overhead per row).
 */
export type ExportableProduct = Record<string, unknown> & {
    id: number | bigint;
    name?: string | null;
    description?: string | null;
    short_description?: string | null;
    slug?: string | null;
    categories?: string[];
    tags?: string[];
    brand?: string | null;
    images?: string[];
    upsells?: string[];
    cross_sells?: string[];
};

/**
 * Resolve a single product into a `Record<columnKey, string>` ready for `Papa.unparse`. Unknown
 * column keys (e.g. `meta:foo` — handled below) and not-set values both render as empty strings
 * so the output column count always matches the header count.
 */
export function resolveRow(
    product: ExportableProduct,
    columns: readonly string[],
    options: ExportFormatOptions = {},
): Record<string, string> {
    const out: Record<string, string> = {};
    for (const col of columns) {
        if (col.startsWith("meta:")) {
            const metaKey = col.slice("meta:".length);
            const meta = (product.meta as Record<string, unknown> | undefined) ?? {};
            out[col] = stringify(meta[metaKey], options);
            continue;
        }
        out[col] = resolveFieldValue(product, col, options);
    }
    return out;
}

function resolveFieldValue(product: ExportableProduct, field: string, opts: ExportFormatOptions): string {
    const definition = IMPORT_FIELD_BY_KEY.get(field);
    /** Money fields (regular_price, sale_price) need the minor→major / digit_style flow. */
    if (field === "regular_price" || field === "sale_price") {
        return formatMoney(product[field], opts);
    }
    if (field === "weight" || field === "length" || field === "width" || field === "height") {
        const camel = `${field}${dimensionSuffix(field)}` as const;
        return stringify(product[camel] ?? product[field], opts);
    }
    if (definition?.type === "date") {
        return formatDate(product[field], opts);
    }
    if (definition?.type === "list") {
        const list = product[field];
        if (Array.isArray(list)) return list.join(" | ");
        return stringify(list, opts);
    }
    if (definition?.type === "boolean") {
        const v = product[field];
        if (v === true) return "1";
        if (v === false) return "0";
        return "";
    }
    return stringify(product[field], opts);
}

function dimensionSuffix(field: string): "_grams" | "_mm" {
    return field === "weight" ? "_grams" : "_mm";
}

function formatMoney(value: unknown, opts: ExportFormatOptions): string {
    if (value === null || value === undefined || value === "") return "";
    const minor = typeof value === "bigint" ? Number(value) : Number(value);
    if (!Number.isFinite(minor)) return "";
    if (opts.money_format === "major") {
        const major = Math.round(minor / 10);
        const grouped = major.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "٬");
        return opts.digit_style === "persian" ? toPersianDigits(grouped) : grouped;
    }
    return opts.digit_style === "persian" ? toPersianDigits(minor) : String(minor);
}

function formatDate(value: unknown, opts: ExportFormatOptions): string {
    if (value === null || value === undefined || value === "") return "";
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) return "";
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth() + 1;
    const d = date.getUTCDate();
    let formatted: string;
    if (opts.date_format === "jalali") {
        const { jy, jm, jd } = jalaali.toJalaali(y, m, d);
        formatted = `${jy}/${pad(jm)}/${pad(jd)}`;
    } else if (opts.date_format === "ddmmyyyy") {
        formatted = `${pad(d)}/${pad(m)}/${y}`;
    } else {
        formatted = `${y}-${pad(m)}-${pad(d)}`;
    }
    return opts.digit_style === "persian" ? toPersianDigits(formatted) : formatted;
}

function pad(n: number): string {
    return n < 10 ? `0${n}` : String(n);
}

function stringify(value: unknown, opts: ExportFormatOptions): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "boolean") return value ? "1" : "0";
    if (Array.isArray(value)) return value.join(" | ");
    if (value instanceof Date) return formatDate(value, opts);
    const s = String(value);
    if (opts.digit_style === "persian") return toPersianDigits(s);
    return s;
}
