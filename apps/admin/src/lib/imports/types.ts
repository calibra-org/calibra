/**
 * Wire-shape types for the CSV product importer endpoints. Mirrors what the API's
 * `ProductImportTransformer` + `ProductImportErrorTransformer` + `runPreview` emit. This module is
 * the local stand-in for the SDK's generated admin types until those endpoints are added to the
 * OpenAPI spec — when that happens, replace these types with the `AdminSchemas["…"]` ones from
 * `@calibra/sdk` and delete this file.
 */

export type ProductImportStatus =
    | "queued"
    | "validating"
    | "running"
    | "completed"
    | "completed_with_errors"
    | "failed"
    | "cancelled"
    | "rolled_back";

export type ProductImportErrorSeverity = "error" | "warning";

export type ProductImportErrorCode =
    | "missing_sku_on_update"
    | "invalid_price"
    | "sale_gt_regular"
    | "invalid_stock"
    | "invalid_type"
    | "invalid_status"
    | "invalid_url"
    | "invalid_date"
    | "invalid_boolean"
    | "unknown_tax_class"
    | "category_create_failed"
    | "db_constraint_violation"
    | "unhandled_exception"
    | "duplicate_sku"
    | "empty_row"
    | "all_columns_unmapped";

export interface ProductImportRow {
    id: number;
    user_id: number;
    status: ProductImportStatus;
    original_filename: string;
    file_size_bytes: number;
    header_hash: string;
    detected_delimiter: string;
    detected_encoding: string;
    mapping: Record<string, string | null>;
    update_existing: boolean;
    total_rows: number;
    processed_rows: number;
    created_count: number;
    updated_count: number;
    skipped_count: number;
    failed_count: number;
    new_categories_count: number;
    new_tags_count: number;
    queued_images_count: number;
    preset_id: number | null;
    has_snapshot: boolean;
    has_error_report: boolean;
    queued_at: string | null;
    started_at: string | null;
    finished_at: string | null;
    cancellation_requested_at: string | null;
    rolled_back_at: string | null;
    rolled_back_by_user_id: number | null;
    exception: string | null;
    is_rollback_eligible: boolean;
    created_at: string | null;
    updated_at: string | null;
}

export interface ProductImportUploadResponse {
    data: ProductImportRow;
    headers: string[];
    samples: Record<string, string[]>;
    preset_match: { id: number; name: string; last_used_at: string | null } | null;
}

export interface PreviewDiff {
    field: string;
    oldValue: string | null;
    newValue: string | null;
    percentChange: number | null;
}

export interface PreviewUpdate {
    sku: string;
    rowNumber: number;
    diffs: PreviewDiff[];
}

export interface PreviewFailure {
    rowNumber: number;
    sku: string | null;
    columnName: string | null;
    code: ProductImportErrorCode;
    message: string;
    originalValue: string | null;
}

/**
 * One skipped row from the preview pass. `code` is the machine-readable reason — the wizard
 * renders a localized label per code so the skip tab actually explains why every row was skipped
 * instead of just showing a count.
 */
export interface PreviewSkip {
    rowNumber: number;
    sku: string | null;
    code: "duplicate_sku" | "empty_row" | "all_columns_unmapped";
}

export interface AnomalyFinding {
    code:
        | "price_jump"
        | "price_drop"
        | "duplicate_sku_in_file"
        | "outlier_price"
        | "missing_required_on_create"
        | "type_mismatch";
    message: string;
    rowNumbers: number[];
    sku?: string;
    field?: string;
}

export interface PreviewResult {
    totals: {
        create: number;
        update: number;
        skip: number;
        fail: number;
        warnings: number;
    };
    updatesPreview: PreviewUpdate[];
    warnings: AnomalyFinding[];
    failures: PreviewFailure[];
    skips: PreviewSkip[];
}

export interface ProductImportErrorRow {
    id: number;
    import_id: number;
    row_number: number;
    sku: string | null;
    column_name: string | null;
    code: ProductImportErrorCode;
    message: string;
    original_value: string | null;
    severity: ProductImportErrorSeverity;
    retried_at: string | null;
    retried_outcome: string | null;
}

export interface ProductImportChangeRow {
    id: number;
    import_id: number;
    product_id: number | null;
    sku: string | null;
    op: "create" | "update";
    field: string;
    old_value: string | null;
    new_value: string | null;
    row_number: number;
    created_at: string | null;
}

/**
 * SSE event payloads — every event the runner publishes through the in-process bus. Keep the union
 * in lockstep with `ImportEventType` in `apps/api/app/services/product_import/event_bus.ts`.
 */
export type ProductImportStreamEvent =
    | {
          type: "progress" | "chunk_start" | "chunk_complete";
          at: string;
          payload?: {
              status?: ProductImportStatus;
              processed?: number;
              total?: number;
              created?: number;
              updated?: number;
              skipped?: number;
              failed?: number;
              offset?: number;
              size?: number;
          };
      }
    | {
          type: "complete";
          at: string;
          payload?: {
              status: ProductImportStatus;
              processed: number;
              created: number;
              updated: number;
              skipped: number;
              failed: number;
          };
      }
    | { type: "failed"; at: string; payload?: { message: string } }
    | { type: "cancelled"; at: string; payload?: undefined }
    | { type: "rolled_back"; at: string; payload?: { byUserId: number } };
