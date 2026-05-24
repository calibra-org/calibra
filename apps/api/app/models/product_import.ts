import { belongsTo, column, hasMany, scope } from "@adonisjs/lucid/orm";
import type { BelongsTo, HasMany } from "@adonisjs/lucid/types/relations";

import { ProductImportSchema } from "#database/schema";
import type { ProductImportStatus } from "#enums/product_import";
import ProductImportChange from "#models/product_import_change";
import ProductImportError from "#models/product_import_error";
import ProductImportMappingPreset from "#models/product_import_mapping_preset";
import User from "#models/user";

/**
 * Per-row mapping the wizard sends to the importer: CSV header → field key (e.g.
 * `"Regular price" → "regular_price"`). A `null` value means "don't import this column" and the
 * runner skips it entirely. `"raw"` only appears as the JSON column type — the application layer
 * always reads via `mapping: ProductImportMapping`.
 */
export type ProductImportMapping = Record<string, string | null>;

/**
 * `ProductImport` — one CSV/XLSX upload, from the moment the operator drops the file through to
 * a green check (or red X) on Step 4. Owns the full lifecycle, the storage paths for the file, the
 * snapshot used by undo, and the error report.
 *
 * The runner mutates this row on every chunk: `processed_rows` + counters + `status`. Both the SSE
 * stream and the polling fallback ultimately read from these columns, so they're the canonical
 * source of progress — the in-memory event bus is an accelerator, not the source of truth.
 */
export default class ProductImport extends ProductImportSchema {
    static table = "product_imports";

    @column({ serializeAs: "status" })
    declare status: ProductImportStatus;

    @column({ serializeAs: "mapping" })
    declare mapping: ProductImportMapping;

    @belongsTo(() => User, { foreignKey: "userId" })
    declare user: BelongsTo<typeof User>;

    @belongsTo(() => User, { foreignKey: "rolledBackByUserId" })
    declare rolledBackBy: BelongsTo<typeof User>;

    @belongsTo(() => ProductImportMappingPreset, { foreignKey: "presetId" })
    declare preset: BelongsTo<typeof ProductImportMappingPreset>;

    @hasMany(() => ProductImportError, { foreignKey: "importId" })
    declare errors: HasMany<typeof ProductImportError>;

    @hasMany(() => ProductImportChange, { foreignKey: "importId" })
    declare changes: HasMany<typeof ProductImportChange>;

    /** Filters to the in-flight statuses. Used by the header-badge query to find live jobs. */
    static inFlight = scope((query) => {
        query.whereIn("status", ["queued", "validating", "running"]);
    });

    /**
     * Filters to imports that finished within the last 24h and have not been rolled back yet —
     * the population that still shows the Step 4 "تشگزاب" button. Excludes `cancelled` because
     * cancelled imports have no diffs to restore.
     */
    static rollbackEligible = scope((query, now: Date = new Date()) => {
        const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        query
            .whereIn("status", ["completed", "completed_with_errors"])
            .whereNull("rolled_back_at")
            .where("finished_at", ">=", cutoff.toISOString());
    });
}
