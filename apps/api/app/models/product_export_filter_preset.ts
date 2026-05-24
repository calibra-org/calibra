import { belongsTo, column } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { ProductExportFilterPresetSchema } from "#database/schema";
import User from "#models/user";

/**
 * `ProductExportFilterPreset` — a named per-user export profile (filters + columns + format).
 * Persists across visits; one preset per user can carry `is_default=true` and auto-hydrate the
 * wizard on next open. Selecting any preset bumps `last_used_at` for sort-by-recency in the
 * dropdown.
 */
export default class ProductExportFilterPreset extends ProductExportFilterPresetSchema {
    static table = "product_export_filter_presets";

    @column({ prepare: jsonbStringify, consume: jsonbParse, serializeAs: "filters" })
    declare filters: Record<string, unknown>;

    @column({ prepare: jsonbStringify, consume: jsonbParse, serializeAs: "columns" })
    declare columns: string[];

    @column({ prepare: jsonbStringify, consume: jsonbParse, serializeAs: "formatOptions" })
    declare formatOptions: Record<string, unknown>;

    @belongsTo(() => User, { foreignKey: "userId" })
    declare user: BelongsTo<typeof User>;
}

function jsonbStringify(value: unknown): string {
    return JSON.stringify(value ?? null);
}

function jsonbParse(value: unknown): unknown {
    if (typeof value === "string") {
        try {
            return JSON.parse(value);
        } catch {
            return value;
        }
    }
    return value;
}
