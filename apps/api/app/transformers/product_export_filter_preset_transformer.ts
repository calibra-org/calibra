import { BaseTransformer } from "@adonisjs/core/transformers";

import type ProductExportFilterPreset from "#models/product_export_filter_preset";

/**
 * Wire shape for a named saved export profile. The wizard renders one card per row in the
 * preset dropdown; selecting hydrates the form, the X delete button calls DELETE.
 */
export default class ProductExportFilterPresetTransformer extends BaseTransformer<ProductExportFilterPreset> {
    toObject() {
        const row = this.resource;
        return {
            id: Number(row.id),
            user_id: Number(row.userId),
            name: row.name,
            filters: row.filters ?? {},
            columns: row.columns ?? [],
            format_options: row.formatOptions ?? {},
            is_default: row.isDefault,
            last_used_at: row.lastUsedAt !== null && row.lastUsedAt !== undefined ? row.lastUsedAt.toISO() : null,
            created_at: row.createdAt !== null && row.createdAt !== undefined ? row.createdAt.toISO() : null,
            updated_at: row.updatedAt !== null && row.updatedAt !== undefined ? row.updatedAt.toISO() : null,
        };
    }
}
