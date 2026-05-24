/**
 * Enum constants for the CSV product importer. Mirrors the Postgres ENUM types created in
 * `1748000…_create_product_imports_table` / `_errors_table` / `_changes_table`. Importing the
 * literal-union types from a single place keeps validators, controllers, and transformers in
 * agreement with the DB.
 */

export const PRODUCT_IMPORT_STATUSES = [
    "queued",
    "validating",
    "running",
    "completed",
    "completed_with_errors",
    "failed",
    "cancelled",
    "rolled_back",
] as const;

export type ProductImportStatus = (typeof PRODUCT_IMPORT_STATUSES)[number];

export const PRODUCT_IMPORT_ERROR_SEVERITIES = ["error", "warning"] as const;
export type ProductImportErrorSeverity = (typeof PRODUCT_IMPORT_ERROR_SEVERITIES)[number];

export const PRODUCT_IMPORT_CHANGE_OPS = ["create", "update"] as const;
export type ProductImportChangeOp = (typeof PRODUCT_IMPORT_CHANGE_OPS)[number];

/**
 * Row-level outcome codes the importer emits. Stable strings — they show up in error reports and
 * in i18n keys (`errors.imports.<code>`), so they cannot be renamed without a follow-up migration
 * of the translation catalogue + any stored error rows.
 */
export const PRODUCT_IMPORT_ERROR_CODES = [
    "missing_sku_on_update",
    "invalid_price",
    "sale_gt_regular",
    "invalid_stock",
    "invalid_type",
    "invalid_status",
    "invalid_url",
    "invalid_date",
    "invalid_boolean",
    "unknown_tax_class",
    "category_create_failed",
    "db_constraint_violation",
    "unhandled_exception",
    "duplicate_sku",
    "empty_row",
    "all_columns_unmapped",
] as const;

export type ProductImportErrorCode = (typeof PRODUCT_IMPORT_ERROR_CODES)[number];
