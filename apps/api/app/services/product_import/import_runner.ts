import logger from "@adonisjs/core/services/logger";
import db from "@adonisjs/lucid/services/db";
import type { TransactionClientContract } from "@adonisjs/lucid/types/database";
import { DateTime } from "luxon";

import ProductImport from "#models/product_import";
import ProductImportChange from "#models/product_import_change";
import ProductImportError from "#models/product_import_error";
import { parseFile } from "#services/product_import/csv_parser";
import { writeErrorReport } from "#services/product_import/error_report";
import { publishImportEvent } from "#services/product_import/event_bus";
import { applyCreate, applyUpdate, type ChangeRecord, type ProductRow } from "#services/product_import/product_writer";
import { type ColumnMapping, type ProjectionError, projectRow } from "#services/product_import/row_projector";
import { type ImportSnapshot, importsLocalPath, snapshotKey, writeSnapshot } from "#services/product_import/storage";
import { newCounters } from "#services/product_import/taxonomy_resolver";
import { notifyImportTerminal } from "#services/product_io_notifier";

/**
 * `runImport` — the real run. Streams progress through the in-memory event bus on every chunk,
 * persists counters on the `product_imports` row as it goes so polling clients + a worker restart
 * both see consistent state, snapshots touched products before writing so undo works for 24h, and
 * commits a chunk-level transaction so a single bad row doesn't poison the whole chunk.
 *
 * The function is invoked from the controller AFTER the upload row has been persisted. It returns
 * once the run finishes (or is cancelled / faulted); the controller's `start` endpoint kicks it
 * off with `void runImport(importId, locale)` so the HTTP request resolves immediately.
 */

const CHUNK_SIZE = 50;

export interface RunOptions {
    importId: number;
    locale: string;
    /**
     * Review-step filters. When set, the runner skips matching rows instead of running them.
     * Forwarded from the controller (which validates them on the start endpoint). In-memory
     * only — not persisted on the import row.
     */
    skipNew?: boolean;
    skipUpdates?: boolean;
    skipWarningRows?: boolean;
}

export async function runImport(opts: RunOptions): Promise<void> {
    const importRow = await ProductImport.find(opts.importId);
    if (importRow === null) {
        logger.warn({ importId: opts.importId }, "runImport: import row missing — abort");
        return;
    }

    const runStartedAt = Date.now();
    try {
        importRow.status = "validating";
        importRow.startedAt = DateTime.utc();
        await importRow.save();
        publishImportEvent({
            type: "progress",
            importId: opts.importId,
            at: new Date().toISOString(),
            payload: { status: "validating", processed: 0, total: importRow.totalRows },
        });

        const parsed = await parseFile(importsLocalPath(importRow.filePath), {
            delimiter: importRow.detectedDelimiter === "auto" ? "auto" : importRow.detectedDelimiter,
            encoding: importRow.detectedEncoding === "auto" ? "auto" : importRow.detectedEncoding,
        });

        importRow.totalRows = parsed.totalRows;
        await importRow.save();

        const mapping = (importRow.mapping ?? {}) as ColumnMapping;

        await writePreImportSnapshot(opts.importId, parsed.rows, mapping);

        importRow.status = "running";
        await importRow.save();
        publishImportEvent({
            type: "progress",
            importId: opts.importId,
            at: new Date().toISOString(),
            payload: { status: "running", processed: 0, total: parsed.totalRows },
        });

        const counters = newCounters();
        let queuedImageCount = 0;
        const warningRowSet = await buildWarningRowSet(parsed.rows, mapping);

        for (let offset = 0; offset < parsed.rows.length; offset += CHUNK_SIZE) {
            if (await isCancellationRequested(opts.importId)) {
                await finalize(importRow, "cancelled", null);
                publishImportEvent({
                    type: "cancelled",
                    importId: opts.importId,
                    at: new Date().toISOString(),
                });
                return;
            }

            const chunk = parsed.rows.slice(offset, offset + CHUNK_SIZE);
            publishImportEvent({
                type: "chunk_start",
                importId: opts.importId,
                at: new Date().toISOString(),
                payload: { offset, size: chunk.length },
            });

            const chunkResult = await runChunk({
                importId: opts.importId,
                chunk,
                offset,
                mapping,
                updateExisting: importRow.updateExisting,
                locale: opts.locale,
                counters,
                skipNew: opts.skipNew === true,
                skipUpdates: opts.skipUpdates === true,
                warningRowSet: opts.skipWarningRows === true ? warningRowSet : EMPTY_SET,
            });
            queuedImageCount += chunkResult.queuedImageCount;

            importRow.processedRows += chunk.length;
            importRow.createdCount += chunkResult.created;
            importRow.updatedCount += chunkResult.updated;
            importRow.skippedCount += chunkResult.skipped;
            importRow.failedCount += chunkResult.failed;
            importRow.newCategoriesCount = counters.categoriesCreated;
            importRow.newTagsCount = counters.tagsCreated;
            importRow.queuedImagesCount = queuedImageCount;
            await importRow.save();

            publishImportEvent({
                type: "chunk_complete",
                importId: opts.importId,
                at: new Date().toISOString(),
                payload: {
                    processed: importRow.processedRows,
                    total: parsed.totalRows,
                    created: importRow.createdCount,
                    updated: importRow.updatedCount,
                    skipped: importRow.skippedCount,
                    failed: importRow.failedCount,
                },
            });
        }

        const allErrors = await ProductImportError.query().where("import_id", opts.importId).orderBy("row_number");
        const reportPath = await writeErrorReport(opts.importId, allErrors);

        const finalStatus = importRow.failedCount > 0 ? "completed_with_errors" : "completed";
        await finalize(importRow, finalStatus, reportPath);
        publishImportEvent({
            type: "complete",
            importId: opts.importId,
            at: new Date().toISOString(),
            payload: {
                status: finalStatus,
                processed: importRow.processedRows,
                created: importRow.createdCount,
                updated: importRow.updatedCount,
                skipped: importRow.skippedCount,
                failed: importRow.failedCount,
            },
        });
        await notifyImportTerminal({ row: importRow, status: finalStatus, durationMs: Date.now() - runStartedAt });
    } catch (err) {
        logger.error({ err, importId: opts.importId }, "runImport: unhandled exception");
        const message = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
        importRow.status = "failed";
        importRow.finishedAt = DateTime.utc();
        importRow.exception = message;
        await importRow.save();
        publishImportEvent({
            type: "failed",
            importId: opts.importId,
            at: new Date().toISOString(),
            payload: { message },
        });
        await notifyImportTerminal({
            row: importRow,
            status: "failed",
            durationMs: Date.now() - runStartedAt,
            failureMessage: message,
        });
    }
}

interface ChunkContext {
    importId: number;
    chunk: Array<Record<string, string>>;
    offset: number;
    mapping: ColumnMapping;
    updateExisting: boolean;
    locale: string;
    counters: ReturnType<typeof newCounters>;
    /** Filters from the review step. The chunk loop checks these per row before committing. */
    skipNew: boolean;
    skipUpdates: boolean;
    /** Set of 1-indexed row numbers flagged by the anomaly detector. `skipWarningRows` consumes this. */
    warningRowSet: ReadonlySet<number>;
}

interface ChunkResult {
    created: number;
    updated: number;
    skipped: number;
    failed: number;
    queuedImageCount: number;
}

async function runChunk(ctx: ChunkContext): Promise<ChunkResult> {
    const counters = ctx.counters;
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    let queuedImageCount = 0;

    const existingMap = await fetchExistingProductsForChunk(ctx.chunk, ctx.mapping);

    for (let i = 0; i < ctx.chunk.length; i++) {
        const rowNumber = ctx.offset + i + 2;
        const raw = ctx.chunk[i]!;
        const projection = projectRow(raw, ctx.mapping);

        if (!projection.hasContent) {
            skipped++;
            continue;
        }

        if (projection.errors.length > 0) {
            failed++;
            await recordErrors(ctx.importId, rowNumber, projection.dto.sku ?? null, projection.errors);
            continue;
        }

        const sku = typeof projection.dto.sku === "string" ? projection.dto.sku.trim() : "";
        const existing = sku === "" ? undefined : existingMap.get(sku);

        if (ctx.warningRowSet.has(rowNumber)) {
            await recordWarning(
                ctx.importId,
                rowNumber,
                sku === "" ? null : sku,
                "duplicate_sku",
                "skipped — row flagged by anomaly detector and operator chose to skip warning rows",
            );
            skipped++;
            continue;
        }
        if (ctx.skipNew && existing === undefined) {
            await recordWarning(
                ctx.importId,
                rowNumber,
                sku === "" ? null : sku,
                "duplicate_sku",
                "skipped — operator chose to skip new products",
            );
            skipped++;
            continue;
        }
        if (ctx.skipUpdates && existing !== undefined) {
            await recordWarning(
                ctx.importId,
                rowNumber,
                sku === "" ? null : sku,
                "duplicate_sku",
                "skipped — operator chose to skip updates",
            );
            skipped++;
            continue;
        }

        try {
            await db.transaction(async (trx) => {
                if (existing !== undefined) {
                    if (!ctx.updateExisting) {
                        await recordWarning(
                            ctx.importId,
                            rowNumber,
                            sku,
                            "duplicate_sku",
                            "product with this SKU exists (update disabled)",
                        );
                        skipped++;
                        return;
                    }
                    const outcome = await applyUpdate(trx, existing, projection.dto, ctx.locale, counters);
                    queuedImageCount += outcome.queuedImageCount;
                    await recordChanges(trx, ctx.importId, outcome.productId, sku, "update", rowNumber, outcome.changes);
                    updated++;
                } else {
                    if (sku === "" && (projection.dto.name === undefined || projection.dto.name === "")) {
                        await recordError(
                            ctx.importId,
                            rowNumber,
                            null,
                            "missing_sku_on_update",
                            "name is required to create",
                            null,
                        );
                        failed++;
                        return;
                    }
                    const outcome = await applyCreate(trx, projection.dto, ctx.locale, counters);
                    queuedImageCount += outcome.queuedImageCount;
                    await recordChanges(
                        trx,
                        ctx.importId,
                        outcome.productId,
                        sku === "" ? null : sku,
                        "create",
                        rowNumber,
                        outcome.changes,
                    );
                    created++;
                }
            });
        } catch (err) {
            failed++;
            const message = err instanceof Error ? err.message : String(err);
            await recordError(ctx.importId, rowNumber, sku === "" ? null : sku, "db_constraint_violation", message, null);
        }
    }

    return { created, updated, skipped, failed, queuedImageCount };
}

const EMPTY_SET: ReadonlySet<number> = new Set();

/**
 * Build the set of 1-indexed row numbers the anomaly detector flagged on this run's data. Used
 * when the operator toggled `skip_warning_rows` on the review step — those rows are diverted
 * straight to `skipped_count` with a warning, never reaching the create/update path.
 */
async function buildWarningRowSet(rows: Array<Record<string, string>>, mapping: ColumnMapping): Promise<ReadonlySet<number>> {
    const { detectAnomalies } = await import("#services/product_import/anomaly_detector");
    const previewRows = rows.map((raw, idx) => {
        const projection = projectRow(raw, mapping);
        return {
            rowNumber: idx + 2,
            dto: projection.dto,
            errors: projection.errors,
            existingRegularPriceMajor: null as number | null,
        };
    });
    const findings = detectAnomalies(previewRows);
    const set = new Set<number>();
    for (const finding of findings) {
        for (const r of finding.rowNumbers) set.add(r);
    }
    return set;
}

async function fetchExistingProductsForChunk(
    chunk: Array<Record<string, string>>,
    mapping: ColumnMapping,
): Promise<Map<string, ProductRow>> {
    const skuColumn = Object.entries(mapping).find(([, key]) => key === "sku")?.[0];
    if (skuColumn === undefined) return new Map();
    const skus = new Set<string>();
    for (const row of chunk) {
        const sku = String(row[skuColumn] ?? "").trim();
        if (sku !== "") skus.add(sku);
    }
    if (skus.size === 0) return new Map();
    const rows = await db
        .from("products")
        .whereNull("deleted_at")
        .whereIn("sku", Array.from(skus))
        .select(
            "id",
            "sku",
            "type",
            "status",
            "catalog_visibility",
            "featured",
            "regular_price",
            "sale_price",
            "tax_status",
            "tax_class_id",
            "shipping_class_id",
            "weight_grams",
            "length_mm",
            "width_mm",
            "height_mm",
            "sold_individually",
            "reviews_allowed",
            "external_url",
            "menu_order",
        );
    const map = new Map<string, ProductRow>();
    for (const row of rows as Array<Record<string, unknown>>) {
        const sku = row.sku as string;
        map.set(sku, {
            id: row.id as number | bigint,
            sku,
            type: row.type as string,
            status: row.status as string,
            catalog_visibility: row.catalog_visibility as string,
            featured: row.featured as boolean,
            regular_price: row.regular_price as number | bigint | null,
            sale_price: row.sale_price as number | bigint | null,
            tax_status: row.tax_status as string,
            tax_class_id: row.tax_class_id as number | bigint | null,
            shipping_class_id: row.shipping_class_id as number | bigint | null,
            weight_grams: row.weight_grams as number | null,
            length_mm: row.length_mm as number | null,
            width_mm: row.width_mm as number | null,
            height_mm: row.height_mm as number | null,
            sold_individually: row.sold_individually as boolean,
            reviews_allowed: row.reviews_allowed as boolean,
            external_url: row.external_url as string | null,
            menu_order: row.menu_order as number,
        });
    }
    return map;
}

async function writePreImportSnapshot(
    importId: number,
    rows: Array<Record<string, string>>,
    mapping: ColumnMapping,
): Promise<void> {
    const skuColumn = Object.entries(mapping).find(([, key]) => key === "sku")?.[0];
    if (skuColumn === undefined) {
        await writeSnapshot(importId, {});
        return;
    }
    const skus = new Set<string>();
    for (const row of rows) {
        const sku = String(row[skuColumn] ?? "").trim();
        if (sku !== "") skus.add(sku);
    }
    if (skus.size === 0) {
        await writeSnapshot(importId, {});
        return;
    }
    const existing = await db
        .from("products")
        .whereNull("deleted_at")
        .whereIn("sku", Array.from(skus))
        .select("sku", "regular_price", "sale_price", "status", "type", "featured");
    const snapshot: ImportSnapshot = {};
    for (const row of existing as Array<Record<string, unknown>>) {
        const sku = row.sku as string;
        snapshot[sku] = {
            regular_price: row.regular_price === null ? null : Number(row.regular_price),
            sale_price: row.sale_price === null ? null : Number(row.sale_price),
            status: row.status as string,
            type: row.type as string,
            featured: row.featured as boolean,
        };
    }
    await writeSnapshot(importId, snapshot);
    /**
     * `snapshot_path` now stores the Drive **key**, not an absolute fs path. The rollback
     * endpoint reads it via {@link readSnapshot} which goes through the disk, so the column's
     * historical name is misleading but the value's meaning is consistent across this codebase.
     */
    await ProductImport.query()
        .where("id", importId)
        .update({ snapshot_path: snapshotKey(importId) });
}

async function isCancellationRequested(importId: number): Promise<boolean> {
    const row = await db.from("product_imports").where("id", importId).select("cancellation_requested_at").first();
    if (!row) return false;
    return (row as { cancellation_requested_at: Date | null }).cancellation_requested_at !== null;
}

async function recordErrors(importId: number, rowNumber: number, sku: string | null, errors: ProjectionError[]): Promise<void> {
    const now = DateTime.utc();
    const records = errors.map((err) => ({
        importId,
        rowNumber,
        sku,
        columnName: err.columnName,
        code: err.code,
        message: err.message,
        originalValue: err.originalValue,
        severity: "error" as const,
        retriedAt: null,
        retriedOutcome: null,
        createdAt: now,
        updatedAt: now,
    }));
    await ProductImportError.createMany(records);
}

async function recordError(
    importId: number,
    rowNumber: number,
    sku: string | null,
    code: string,
    message: string,
    columnName: string | null,
): Promise<void> {
    await ProductImportError.create({
        importId,
        rowNumber,
        sku,
        columnName,
        code: code as never,
        message,
        originalValue: null,
        severity: "error",
    });
}

async function recordWarning(
    importId: number,
    rowNumber: number,
    sku: string | null,
    code: string,
    message: string,
): Promise<void> {
    await ProductImportError.create({
        importId,
        rowNumber,
        sku,
        columnName: null,
        code: code as never,
        message,
        originalValue: null,
        severity: "warning",
    });
}

async function recordChanges(
    trx: TransactionClientContract,
    importId: number,
    productId: number,
    sku: string | null,
    op: "create" | "update",
    rowNumber: number,
    changes: ChangeRecord[],
): Promise<void> {
    if (changes.length === 0) return;
    for (const c of changes) {
        const row = new ProductImportChange();
        row.importId = importId;
        row.productId = productId;
        row.sku = sku;
        row.op = op;
        row.field = c.field;
        row.oldValue = c.oldValue;
        row.newValue = c.newValue;
        row.rowNumber = rowNumber;
        row.useTransaction(trx);
        await row.save();
    }
}

async function finalize(
    importRow: ProductImport,
    status: "completed" | "completed_with_errors" | "cancelled",
    errorReportPath: string | null,
): Promise<void> {
    importRow.status = status;
    importRow.finishedAt = DateTime.utc();
    if (errorReportPath !== null) importRow.errorReportPath = errorReportPath;
    await importRow.save();
}
