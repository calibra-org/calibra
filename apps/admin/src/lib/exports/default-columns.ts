import { IMPORT_FIELDS } from "@calibra/shared/import-fields";

/**
 * Canonical column-preset profiles for the export wizard's "bulk action" row above the column
 * picker. The set is small + opinionated — operators who need finer control compose their own
 * via the searchable multi-select.
 *
 * `default` mirrors the importer's `TEMPLATE_HEADERS` so a downloaded export with default options
 * round-trips losslessly through the importer.
 */

export const DEFAULT_EXPORT_COLUMNS = [
    "sku",
    "name",
    "type",
    "status",
    "regular_price",
    "sale_price",
    "stock_quantity",
    "stock_status",
    "categories",
    "tags",
    "brand",
    "short_description",
    "description",
    "weight",
    "length",
    "width",
    "height",
    "images",
    "parent_sku",
    "external_url",
] as const;

/** Every field the importer accepts — useful for the "All columns" bulk action. */
export const ALL_EXPORT_COLUMNS = IMPORT_FIELDS.map((f) => f.key);

/** Required-for-create only — useful for "minimum viable re-import" exports. */
export const REQUIRED_EXPORT_COLUMNS = IMPORT_FIELDS.filter((f) => f.required === "create" || f.required === "update").map(
    (f) => f.key,
);

/** Pricing-only — sku + name + the two price columns + stock. */
export const PRICING_EXPORT_COLUMNS = ["sku", "name", "regular_price", "sale_price", "stock_quantity"];

export type ColumnPresetId = "default" | "all" | "required" | "pricing" | "none";

export function columnsForPreset(id: ColumnPresetId): string[] {
    switch (id) {
        case "default":
            return [...DEFAULT_EXPORT_COLUMNS];
        case "all":
            return [...ALL_EXPORT_COLUMNS];
        case "required":
            return [...REQUIRED_EXPORT_COLUMNS];
        case "pricing":
            return [...PRICING_EXPORT_COLUMNS];
        case "none":
            return [];
    }
}
