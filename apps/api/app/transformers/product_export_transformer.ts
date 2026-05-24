import { BaseTransformer } from "@adonisjs/core/transformers";

import type ProductExport from "#models/product_export";

/**
 * Wire shape for one export-job row. Matches the importer transformer's vocabulary (snake_case,
 * counters as numbers even though DB columns are int4) so the admin's wizard component shapes
 * stay consistent across the two flows.
 *
 * `is_downloadable` is computed from the row's status + file_path + expiry, so the wizard knows
 * whether to show "Download" vs "File no longer available · Re-run".
 */
export default class ProductExportTransformer extends BaseTransformer<ProductExport> {
    toObject() {
        const row = this.resource;
        return {
            id: Number(row.id),
            user_id: Number(row.userId),
            status: row.status,
            scope: row.scope,
            preset_id: row.presetId !== null && row.presetId !== undefined ? Number(row.presetId) : null,

            filters: row.filters ?? {},
            columns: row.columns ?? [],
            format_options: row.formatOptions ?? {},

            original_filename: row.originalFilename,
            file_size_bytes: numericOrZero(row.fileSizeBytes),
            compressed: row.compressed,

            has_file: row.filePath !== null && row.filePath !== undefined,
            download_expires_at:
                row.downloadExpiresAt !== null && row.downloadExpiresAt !== undefined ? row.downloadExpiresAt.toISO() : null,
            is_downloadable: this.isDownloadable(row),

            total_rows: numericOrZero(row.totalRows),
            processed_rows: numericOrZero(row.processedRows),

            started_at: row.startedAt !== null && row.startedAt !== undefined ? row.startedAt.toISO() : null,
            finished_at: row.finishedAt !== null && row.finishedAt !== undefined ? row.finishedAt.toISO() : null,
            cancellation_requested_at:
                row.cancellationRequestedAt !== null && row.cancellationRequestedAt !== undefined
                    ? row.cancellationRequestedAt.toISO()
                    : null,

            exception: row.exception,

            created_at: row.createdAt !== null && row.createdAt !== undefined ? row.createdAt.toISO() : null,
            updated_at: row.updatedAt !== null && row.updatedAt !== undefined ? row.updatedAt.toISO() : null,
        };
    }

    private isDownloadable(row: ProductExport): boolean {
        if (row.status !== "completed") return false;
        if (row.filePath === null || row.filePath === undefined) return false;
        const expires = row.downloadExpiresAt;
        if (expires === null || expires === undefined) return false;
        return Date.now() < expires.toMillis();
    }
}

function numericOrZero(value: number | bigint | string | null | undefined): number {
    if (value === null || value === undefined) return 0;
    const num = typeof value === "bigint" ? Number(value) : Number(value);
    return Number.isFinite(num) ? num : 0;
}
