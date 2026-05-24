import { BaseTransformer } from "@adonisjs/core/transformers";

import type ProductImportChange from "#models/product_import_change";

/**
 * Wire shape for the per-product diff log shown in the import-history detail view. Powers the
 * "why did this product's price change last Tuesday?" answer surface.
 */
export default class ProductImportChangeTransformer extends BaseTransformer<ProductImportChange> {
    toObject() {
        const row = this.resource;
        return {
            id: Number(row.id),
            import_id: Number(row.importId),
            product_id: row.productId !== null && row.productId !== undefined ? Number(row.productId) : null,
            sku: row.sku,
            op: row.op,
            field: row.field,
            old_value: row.oldValue,
            new_value: row.newValue,
            row_number: row.rowNumber,
            created_at: row.createdAt !== null && row.createdAt !== undefined ? row.createdAt.toISO() : null,
        };
    }
}
