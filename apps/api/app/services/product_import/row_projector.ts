/**
 * Project a raw CSV row + a column mapping into a typed import DTO that the runner can hand to
 * the create / update path. Validation errors are surfaced as a list (not a thrown exception) so
 * the runner can record every column-level problem on a single row instead of stopping at the
 * first one.
 */

import type { ProductImportErrorCode } from "#enums/product_import";
import { parseDateLoose, parseLooseBoolean, parseLooseNumber, toEnglishDigits } from "#services/product_import/cell_normalizer";
import { IMPORT_FIELD_BY_KEY, type ImportField } from "#services/product_import/import_field_catalog";

/** Mapping shape: `{ csv_header: field_key | null }`. `null` = "don't import this column". */
export type ColumnMapping = Record<string, string | null>;

/** Per-cell validation problem captured during projection — runner stores these in the error log. */
export interface ProjectionError {
    columnName: string;
    code: ProductImportErrorCode;
    message: string;
    originalValue: string | null;
}

/**
 * Typed bag of fields ready for the create / update pass. Prices are kept as *major* units (Toman)
 * here — the runner multiplies by 10 to get the canonical *minor* units (Rial) when persisting.
 * Optional fields are absent (not `undefined`) when the mapping didn't include them, so the
 * runner can distinguish "leave unchanged" (key missing) from "clear this field" (key set to
 * `null`).
 */
export interface ProductImportDTO {
    sku?: string | null;
    name?: string;
    type?: "simple" | "variable" | "grouped" | "external";
    status?: "publish" | "draft" | "pending" | "private";
    visibility?: "visible" | "catalog" | "search" | "hidden";
    short_description?: string | null;
    description?: string | null;
    featured?: boolean;
    allow_reviews?: boolean;
    purchase_note?: string | null;
    menu_order?: number;

    regular_price_major?: number | null;
    sale_price_major?: number | null;
    sale_price_start?: Date | null;
    sale_price_end?: Date | null;
    tax_status?: "taxable" | "shipping" | "none";
    tax_class?: string | null;

    manage_stock?: boolean;
    stock_quantity?: number | null;
    stock_status?: "instock" | "outofstock" | "onbackorder";
    backorders_allowed?: boolean;
    sold_individually?: boolean;

    weight_grams?: number | null;
    length_mm?: number | null;
    width_mm?: number | null;
    height_mm?: number | null;
    shipping_class?: string | null;

    categories?: string[];
    tags?: string[];
    brand?: string | null;
    images?: string[];

    parent_sku?: string | null;
    upsells?: string[];
    cross_sells?: string[];
    external_url?: string | null;
    button_text?: string | null;
}

export interface ProjectionResult {
    dto: ProductImportDTO;
    errors: ProjectionError[];
    /** `true` when at least one mapped column had a non-empty value. */
    hasContent: boolean;
}

/**
 * Project one CSV row into a ProductImportDTO using the supplied mapping. The runner decides
 * whether the row is a create or update based on `dto.sku` + DB lookup *after* projection.
 */
export function projectRow(row: Record<string, string>, mapping: ColumnMapping): ProjectionResult {
    const dto: ProductImportDTO = {};
    const errors: ProjectionError[] = [];
    let hasContent = false;

    for (const [csvHeader, fieldKey] of Object.entries(mapping)) {
        if (fieldKey === null) continue;
        const field = IMPORT_FIELD_BY_KEY.get(fieldKey);
        if (field === undefined) continue;

        const raw = row[csvHeader];
        if (raw === undefined) continue;
        const trimmed = String(raw).trim();
        if (trimmed === "") continue;
        hasContent = true;

        const result = projectCell(field, trimmed, csvHeader);
        if (result.error !== null) {
            errors.push(result.error);
            continue;
        }
        if (result.value === undefined) continue;
        assignField(dto, field.key, result.value);
    }

    if (
        dto.regular_price_major !== undefined &&
        dto.regular_price_major !== null &&
        dto.sale_price_major !== undefined &&
        dto.sale_price_major !== null &&
        dto.sale_price_major > dto.regular_price_major
    ) {
        errors.push({
            columnName: "sale_price",
            code: "sale_gt_regular",
            message: "sale_price > regular_price",
            originalValue: String(dto.sale_price_major),
        });
    }

    return { dto, errors, hasContent };
}

interface CellResult {
    value: unknown;
    error: ProjectionError | null;
}

function projectCell(field: ImportField, raw: string, columnName: string): CellResult {
    switch (field.type) {
        case "text": {
            return { value: raw, error: null };
        }
        case "number": {
            const parsed = parseLooseNumber(raw);
            if (parsed === null) {
                return numberError(field.key, columnName, raw);
            }
            if (field.key === "regular_price" || field.key === "sale_price") {
                if (parsed < 0) return priceError(field.key, columnName, raw);
            }
            if (field.key === "stock_quantity") {
                if (parsed < 0 || !Number.isInteger(parsed)) return stockError(columnName, raw);
            }
            return { value: parsed, error: null };
        }
        case "boolean": {
            const parsed = parseLooseBoolean(raw);
            if (parsed === null) {
                return {
                    value: undefined,
                    error: {
                        columnName,
                        code: "invalid_boolean",
                        message: "invalid boolean value",
                        originalValue: raw,
                    },
                };
            }
            return { value: parsed, error: null };
        }
        case "date": {
            const date = parseDateLoose(raw);
            if (date === null) {
                return {
                    value: undefined,
                    error: { columnName, code: "invalid_date", message: "invalid date format", originalValue: raw },
                };
            }
            return { value: date, error: null };
        }
        case "url": {
            try {
                const url = new URL(toEnglishDigits(raw));
                if (url.protocol !== "http:" && url.protocol !== "https:") return urlError(columnName, raw);
                return { value: url.toString(), error: null };
            } catch {
                return urlError(columnName, raw);
            }
        }
        case "enum": {
            const normalized = raw.toLowerCase();
            if (field.enumValues !== undefined && !field.enumValues.includes(normalized)) {
                return enumError(field.key, columnName, raw);
            }
            return { value: normalized, error: null };
        }
        case "list": {
            const items = raw
                .split(/[|,،]/)
                .map((part) => part.trim())
                .filter((part) => part !== "");
            return { value: items, error: null };
        }
    }
}

function assignField(dto: ProductImportDTO, key: string, value: unknown): void {
    const record = dto as unknown as Record<string, unknown>;
    if (key === "regular_price") record.regular_price_major = value;
    else if (key === "sale_price") record.sale_price_major = value;
    else if (key === "weight") record.weight_grams = value;
    else if (key === "length") record.length_mm = value;
    else if (key === "width") record.width_mm = value;
    else if (key === "height") record.height_mm = value;
    else record[key] = value;
}

function numberError(fieldKey: string, columnName: string, raw: string): CellResult {
    if (fieldKey === "regular_price" || fieldKey === "sale_price") return priceError(fieldKey, columnName, raw);
    if (fieldKey === "stock_quantity") return stockError(columnName, raw);
    return {
        value: undefined,
        error: { columnName, code: "invalid_price", message: "invalid number", originalValue: raw },
    };
}

function priceError(_fieldKey: string, columnName: string, raw: string): CellResult {
    return {
        value: undefined,
        error: { columnName, code: "invalid_price", message: "invalid price", originalValue: raw },
    };
}

function stockError(columnName: string, raw: string): CellResult {
    return {
        value: undefined,
        error: { columnName, code: "invalid_stock", message: "invalid stock quantity", originalValue: raw },
    };
}

function urlError(columnName: string, raw: string): CellResult {
    return {
        value: undefined,
        error: { columnName, code: "invalid_url", message: "invalid URL", originalValue: raw },
    };
}

function enumError(fieldKey: string, columnName: string, raw: string): CellResult {
    const code: ProductImportErrorCode =
        fieldKey === "type" ? "invalid_type" : fieldKey === "status" ? "invalid_status" : "invalid_boolean";
    return {
        value: undefined,
        error: { columnName, code, message: `invalid value for ${fieldKey}`, originalValue: raw },
    };
}
