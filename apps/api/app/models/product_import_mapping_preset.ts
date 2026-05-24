import { belongsTo, column } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { ProductImportMappingPresetSchema } from "#database/schema";
import type { ProductImportMapping } from "#models/product_import";
import User from "#models/user";

/**
 * `ProductImportMappingPreset` — a saved column-mapping keyed by `headerHash` (FNV-1a digest of
 * the normalized + sorted header set, computed via `@calibra/shared/import-fields`).
 *
 * Per spec point 12, presets are *per CSV shape*, not per user — when an operator uploads a file
 * whose headers match an earlier import, the wizard auto-applies the same mapping and shows a
 * yellow "applied previous mapping — click to change" banner. Named presets (the operator hits
 * "save as preset") are persisted; auto-saved presets are upserted on each successful import so
 * the most recent mapping for a shape always wins on next upload.
 */
export default class ProductImportMappingPreset extends ProductImportMappingPresetSchema {
    static table = "product_import_mapping_presets";

    @column({ serializeAs: "mapping" })
    declare mapping: ProductImportMapping;

    @belongsTo(() => User, { foreignKey: "createdByUserId" })
    declare createdBy: BelongsTo<typeof User>;
}
