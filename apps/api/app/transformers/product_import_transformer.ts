import { BaseTransformer } from "@adonisjs/core/transformers";

import type ProductImport from "#models/product_import";

/**
 * Wire shape for the import-job row consumed by the admin wizard. Snake-cased so the SDK
 * generated types match the OpenAPI spec (`AdminProductImport`).
 *
 * `mapping` is always a plain object (the column-header → field-key map). Counters surface as
 * numbers even though the DB columns are int4 — Lucid sometimes returns these as bigint-ish for
 * larger tables; we coerce defensively.
 *
 * `is_rollback_eligible` is computed: `true` when status is `completed`/`completed_with_errors`,
 * the import has not been rolled back, and `finished_at` is within the last 24h. Powers the Step 4
 * undo banner without the UI needing to know the rule.
 */
export default class ProductImportTransformer extends BaseTransformer<ProductImport> {
    toObject() {
        const row = this.resource;
        return {
            id: Number(row.id),
            user_id: Number(row.userId),
            status: row.status,
            original_filename: row.originalFilename,
            file_size_bytes: numericOrZero(row.fileSizeBytes),
            header_hash: row.headerHash,
            detected_delimiter: row.detectedDelimiter,
            detected_encoding: row.detectedEncoding,
            mapping: row.mapping ?? {},
            update_existing: row.updateExisting,

            total_rows: numericOrZero(row.totalRows),
            processed_rows: numericOrZero(row.processedRows),
            created_count: numericOrZero(row.createdCount),
            updated_count: numericOrZero(row.updatedCount),
            skipped_count: numericOrZero(row.skippedCount),
            failed_count: numericOrZero(row.failedCount),
            new_categories_count: numericOrZero(row.newCategoriesCount),
            new_tags_count: numericOrZero(row.newTagsCount),
            queued_images_count: numericOrZero(row.queuedImagesCount),

            preset_id: row.presetId !== null && row.presetId !== undefined ? Number(row.presetId) : null,

            has_snapshot: row.snapshotPath !== null && row.snapshotPath !== undefined,
            has_error_report: row.errorReportPath !== null && row.errorReportPath !== undefined,

            queued_at: row.queuedAt !== null && row.queuedAt !== undefined ? row.queuedAt.toISO() : null,
            started_at: row.startedAt !== null && row.startedAt !== undefined ? row.startedAt.toISO() : null,
            finished_at: row.finishedAt !== null && row.finishedAt !== undefined ? row.finishedAt.toISO() : null,
            cancellation_requested_at:
                row.cancellationRequestedAt !== null && row.cancellationRequestedAt !== undefined
                    ? row.cancellationRequestedAt.toISO()
                    : null,
            rolled_back_at:
                row.rolledBackAt !== null && row.rolledBackAt !== undefined ? row.rolledBackAt.toISO() : null,
            rolled_back_by_user_id:
                row.rolledBackByUserId !== null && row.rolledBackByUserId !== undefined
                    ? Number(row.rolledBackByUserId)
                    : null,

            exception: row.exception,
            is_rollback_eligible: this.isRollbackEligible(row),

            created_at: row.createdAt !== null && row.createdAt !== undefined ? row.createdAt.toISO() : null,
            updated_at: row.updatedAt !== null && row.updatedAt !== undefined ? row.updatedAt.toISO() : null,
        };
    }

    private isRollbackEligible(row: ProductImport): boolean {
        if (row.rolledBackAt !== null && row.rolledBackAt !== undefined) return false;
        if (row.status !== "completed" && row.status !== "completed_with_errors") return false;
        if (row.snapshotPath === null || row.snapshotPath === undefined) return false;
        const finished = row.finishedAt;
        if (finished === null || finished === undefined) return false;
        const elapsedMs = Date.now() - finished.toMillis();
        return elapsedMs < 24 * 60 * 60 * 1000;
    }
}

function numericOrZero(value: number | bigint | string | null | undefined): number {
    if (value === null || value === undefined) return 0;
    const num = typeof value === "bigint" ? Number(value) : Number(value);
    return Number.isFinite(num) ? num : 0;
}
