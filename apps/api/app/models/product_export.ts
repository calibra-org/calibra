import { belongsTo, column, scope } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { ProductExportSchema } from "#database/schema";
import type { ProductExportScope, ProductExportStatus } from "#enums/product_export";
import ProductExportFilterPreset from "#models/product_export_filter_preset";
import User from "#models/user";

/**
 * Wire shape for the chosen format options stored on `product_exports.format_options`. Loose
 * record by design — the wizard adds/removes options without forcing a migration each time, and
 * the runner reads what it needs while ignoring unknowns.
 */
export type ProductExportFormatOptions = Record<string, unknown>;

/**
 * `ProductExport` — one export request from kick-off to file ready. Lifecycle mirrors the
 * importer's: counters mutate on every chunk, status flips through queued → running → terminal,
 * SSE + polling both read this row as the canonical source of truth (the in-memory event bus is
 * just an accelerator). The signed-download bookkeeping lives here too: `download_token_hash`
 * holds the HMAC the download endpoint compares against, `download_expires_at` is the 24h cutoff.
 */
export default class ProductExport extends ProductExportSchema {
    static table = "product_exports";

    @column({ serializeAs: "status" })
    declare status: ProductExportStatus;

    @column({ serializeAs: "scope" })
    declare scope: ProductExportScope;

    @column({ prepare: jsonbStringify, consume: jsonbParse, serializeAs: "filters" })
    declare filters: Record<string, unknown>;

    @column({ prepare: jsonbStringify, consume: jsonbParse, serializeAs: "columns" })
    declare columns: string[];

    @column({ prepare: jsonbStringify, consume: jsonbParse, serializeAs: "formatOptions" })
    declare formatOptions: ProductExportFormatOptions;

    @belongsTo(() => User, { foreignKey: "userId" })
    declare user: BelongsTo<typeof User>;

    @belongsTo(() => ProductExportFilterPreset, { foreignKey: "presetId" })
    declare preset: BelongsTo<typeof ProductExportFilterPreset>;

    /** Filters to the in-flight statuses. */
    static inFlight = scope((query) => {
        query.whereIn("status", ["queued", "running"]);
    });

    /** Filters to exports whose download is still valid (24h window and file present on disk). */
    static downloadable = scope((query, now: Date = new Date()) => {
        query
            .where("status", "completed")
            .whereNotNull("file_path")
            .whereNotNull("download_expires_at")
            .where("download_expires_at", ">=", now.toISOString());
    });
}

/**
 * jsonb prepare/consume helpers. Lucid auto-converts plain objects but not arrays — we ship
 * both shapes (`columns` is an array, `filters` + `formatOptions` are objects) so we drive the
 * stringify/parse uniformly across all three columns.
 */
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
