import { BaseTransformer } from "@adonisjs/core/transformers";

import type ProductImportError from "#models/product_import_error";

/**
 * Wire shape for one error/warning row in the Step 4 panel. The wizard renders this directly into
 * the editable retry table — `original_value` is the seed for the inline input, and `retried_at` /
 * `retried_outcome` are non-null after the operator clicks "retry" on the row.
 */
export default class ProductImportErrorTransformer extends BaseTransformer<ProductImportError> {
    toObject() {
        const row = this.resource;
        return {
            id: Number(row.id),
            import_id: Number(row.importId),
            row_number: row.rowNumber,
            sku: row.sku,
            column_name: row.columnName,
            code: row.code,
            message: row.message,
            original_value: row.originalValue,
            severity: row.severity,
            retried_at: row.retriedAt !== null && row.retriedAt !== undefined ? row.retriedAt.toISO() : null,
            retried_outcome: row.retriedOutcome,
        };
    }
}
