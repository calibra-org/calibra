/**
 * Enum constants for the CSV product exporter. Mirrors the Postgres ENUM types created in
 * `1748100…_create_product_exports_table`.
 */

export const PRODUCT_EXPORT_STATUSES = [
    "queued",
    "running",
    "completed",
    "completed_with_errors",
    "failed",
    "cancelled",
] as const;

export type ProductExportStatus = (typeof PRODUCT_EXPORT_STATUSES)[number];

export const PRODUCT_EXPORT_SCOPES = ["all", "filter", "selected", "preset"] as const;
export type ProductExportScope = (typeof PRODUCT_EXPORT_SCOPES)[number];
