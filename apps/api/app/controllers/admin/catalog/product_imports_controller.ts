import type { HttpContext } from "@adonisjs/core/http";
import { DateTime } from "luxon";

import { cancelImport, rollbackImport, viewImport } from "#abilities/main";
import RunImportJob from "#jobs/run_import_job";
import ProductImport from "#models/product_import";
import ProductImportChange from "#models/product_import_change";
import ProductImportError from "#models/product_import_error";
import ProductImportMappingPreset from "#models/product_import_mapping_preset";
import { parseFile } from "#services/product_import/csv_parser";
import { publishImportEvent } from "#services/product_import/event_bus";
import { hashHeaderSet, suggestMapping } from "#services/product_import/import_field_catalog";
import { runPreview } from "#services/product_import/preview_runner";
import { importsLocalPath, readSnapshot, uploadKey } from "#services/product_import/storage";
import { TEMPLATE_HEADERS, TEMPLATE_SAMPLE_ROWS } from "#services/product_import/template_columns";
import { paginated, resource } from "#transformers/api_envelope";
import ProductImportChangeTransformer from "#transformers/product_import_change_transformer";
import ProductImportErrorTransformer from "#transformers/product_import_error_transformer";
import ProductImportTransformer from "#transformers/product_import_transformer";
import {
    errorsQueryValidator,
    importHistoryQueryValidator,
    previewImportValidator,
    retryFailedValidator,
    retryRowValidator,
    startImportValidator,
    uploadImportValidator,
} from "#validators/admin/product_import_validator";

/**
 * `AdminProductImportsController` — every endpoint behind the CSV product importer wizard. The
 * controller is intentionally thin: business logic lives in `services/product_import/*`, the
 * controller maps HTTP shape ↔ service calls + handles the SSE streaming response.
 *
 * Routes are grouped under `/api/v1/admin/products/import/*` and gated by auth + admin middleware
 * in `start/routes/admin_product_imports.ts`. Per-row ownership is enforced via the
 * {@link viewImport} / {@link cancelImport} / {@link rollbackImport} Bouncer abilities so a peer
 * admin probing another operator's import receives a 403 (not a confused 404).
 */
export default class AdminProductImportsController {
    /**
     * `GET /api/v1/admin/products/import/template` — returns the canonical empty CSV template the
     * Step 1 "هنومن بلاق دولناد" button downloads. UTF-8 BOM so Excel opens it with Persian glyphs
     * intact; three sample rows so first-time operators see what fits where.
     */
    async template(ctx: HttpContext) {
        const lines = [TEMPLATE_HEADERS.join(","), ...TEMPLATE_SAMPLE_ROWS.map((row) => row.map(escapeCsv).join(","))];
        ctx.response.header("content-type", "text/csv; charset=utf-8");
        ctx.response.header("content-disposition", 'attachment; filename="product-import-template.csv"');
        return `﻿${lines.join("\n")}\n`;
    }

    /**
     * `POST /api/v1/admin/products/import/upload` — multipart upload. Validates + stores under
     * `storage/imports/`, parses headers + samples, suggests an auto-mapping, and returns the new
     * `ProductImport` row in `validating` status with all the wizard needs to render Step 2.
     */
    async upload(ctx: HttpContext) {
        const { request, response, auth } = ctx;
        await uploadImportValidator.validate(request.only(["delimiter", "encoding"]));

        const file = request.file("file", {
            size: "100mb",
            extnames: ["csv", "txt", "xlsx", "xls"],
        });
        if (file === null) {
            return response
                .status(422)
                .json({ errors: [{ message: "file field is required", rule: "required", field: "file" }] });
        }
        if (!file.isValid) {
            return response.status(422).json({
                errors: (file.errors ?? []).map((err) => ({ message: err.message, rule: err.type, field: err.fieldName })),
            });
        }

        const userId = auth.user!.id;
        const row = new ProductImport();
        row.userId = userId;
        row.status = "validating";
        row.originalFilename = file.clientName ?? "import.csv";
        row.filePath = "pending";
        row.fileSizeBytes = file.size ?? 0;
        row.headerHash = "pending";
        row.detectedDelimiter = "auto";
        row.detectedEncoding = "auto";
        row.mapping = {};
        row.updateExisting = false;
        await row.save();

        /**
         * `row.filePath` stores the Drive **key** going forward, not an absolute filesystem
         * path. `moveToDisk` handles the tmp → storage transfer atomically via the configured
         * disk's driver (S3 + R2 use server-side copy under the hood when the tmp file is local).
         */
        const key = uploadKey(Number(row.id), row.originalFilename);
        await file.moveToDisk(key, "imports");
        row.filePath = key;
        await row.save();

        let parsed: Awaited<ReturnType<typeof parseFile>>;
        try {
            parsed = await parseFile(importsLocalPath(key), {
                delimiter: "auto",
                encoding: "auto",
                limit: 200,
            });
        } catch (err) {
            row.status = "failed";
            row.exception = err instanceof Error ? err.message : String(err);
            await row.save();
            return response.status(422).json({
                errors: [{ message: "could not read file — try a different encoding or delimiter", code: "E_PARSE_FAILED" }],
            });
        }

        row.headerHash = hashHeaderSet(parsed.headers);
        row.detectedDelimiter = parsed.detectedDelimiter;
        row.detectedEncoding = parsed.detectedEncoding;
        row.totalRows = parsed.totalRows;
        row.mapping = suggestMapping(parsed.headers);
        await row.save();

        const preset = await ProductImportMappingPreset.query()
            .where("header_hash", row.headerHash)
            .orderBy("last_used_at", "desc")
            .first();
        if (preset !== null) {
            row.mapping = preset.mapping;
            row.presetId = Number(preset.id);
            await row.save();
        }

        response.status(201);
        const transformed = await resource(ProductImportTransformer.transform(row));
        return {
            ...transformed,
            headers: parsed.headers,
            samples: parsed.samples,
            preset_match:
                preset === null
                    ? null
                    : { id: Number(preset.id), name: preset.name, last_used_at: preset.lastUsedAt?.toISO() ?? null },
        };
    }

    /**
     * `POST /api/v1/admin/products/import/preview` — dry-run pass. No DB writes; returns counters,
     * inline diff rows, anomaly warnings, and the failure preview list.
     */
    async preview(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(previewImportValidator);
        const row = await ProductImport.findOrFail(payload.import_id);
        await ctx.bouncer.authorize(viewImport, row);

        row.mapping = payload.mapping;
        row.updateExisting = payload.update_existing ?? false;
        await row.save();

        const result = await runPreview({
            filePath: importsLocalPath(row.filePath),
            mapping: payload.mapping,
            updateExisting: payload.update_existing ?? false,
            delimiter: row.detectedDelimiter,
            encoding: row.detectedEncoding,
        });

        return { data: result };
    }

    /**
     * `POST /api/v1/admin/products/import/start` — finalize the mapping, kick the runner off
     * fire-and-forget, and return immediately. The wizard transitions to Step 3 and subscribes to
     * progress via the `/stream` endpoint.
     */
    async start(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(startImportValidator);
        const row = await ProductImport.findOrFail(payload.import_id);
        await ctx.bouncer.authorize(viewImport, row);

        row.mapping = payload.mapping;
        row.updateExisting = payload.update_existing ?? false;
        row.status = "queued";
        row.queuedAt = DateTime.utc();
        await row.save();

        const actorId = Number(ctx.auth.user!.id);
        if (payload.save_preset === true && payload.preset_name !== undefined) {
            await this.savePreset(
                row.headerHash,
                payload.preset_name,
                payload.mapping,
                payload.update_existing ?? false,
                actorId,
            );
        } else {
            await this.touchAutoPreset(row.headerHash, payload.mapping, payload.update_existing ?? false, actorId);
        }

        /**
         * The run is handed off to the queue worker via `RunImportJob.dispatch(...)`. Under the
         * `sync` driver (tests) the job runs inline; under `database` (dev + prod) the worker
         * picks it up within `idleDelay`. Either way the controller returns 202 immediately —
         * the wizard subscribes to Transmit for live progress.
         */
        await RunImportJob.dispatch({
            importId: Number(row.id),
            locale: ctx.i18n.locale,
            skipNew: payload.skip_new === true,
            skipUpdates: payload.skip_updates === true,
            skipWarningRows: payload.skip_warning_rows === true,
        });

        ctx.response.status(202);
        return resource(ProductImportTransformer.transform(row));
    }

    /** `GET /api/v1/admin/products/import/{id}` — single import row (polling fallback). */
    async show(ctx: HttpContext) {
        const row = await ProductImport.findOrFail(ctx.params.id);
        await ctx.bouncer.authorize(viewImport, row);
        return resource(ProductImportTransformer.transform(row));
    }

    /** `POST /api/v1/admin/products/import/{id}/cancel` — set the cancellation flag. */
    async cancel(ctx: HttpContext) {
        const row = await ProductImport.findOrFail(ctx.params.id);
        await ctx.bouncer.authorize(cancelImport, row);
        if (row.cancellationRequestedAt === null) {
            row.cancellationRequestedAt = DateTime.utc();
            await row.save();
        }
        return resource(ProductImportTransformer.transform(row));
    }

    /** `GET /api/v1/admin/products/import/{id}/errors` — list per-row failures + warnings. */
    async errors(ctx: HttpContext) {
        const row = await ProductImport.findOrFail(ctx.params.id);
        await ctx.bouncer.authorize(viewImport, row);
        const filters = await errorsQueryValidator.validate(ctx.request.qs());
        const query = ProductImportError.query().where("import_id", Number(row.id)).orderBy("row_number", "asc");
        if (filters.severity !== undefined) query.where("severity", filters.severity);
        if (filters.include_resolved !== true) query.whereNull("retried_at");

        const page = Math.max(1, Number(ctx.request.input("page", 1)) || 1);
        const perPage = Math.min(200, Math.max(1, Number(ctx.request.input("per_page", 50)) || 50));
        const paginator = await query.paginate(page, perPage);
        return paginated(ProductImportErrorTransformer.transform(paginator.all()), paginator);
    }

    /**
     * `POST /api/v1/admin/products/import/{id}/retry-row` — single-row retry with the
     * operator-edited value. Updates the source column on disk-stored error row, replays the row
     * through the runner inline, and marks the error as resolved on success.
     */
    async retryRow(ctx: HttpContext) {
        const row = await ProductImport.findOrFail(ctx.params.id);
        await ctx.bouncer.authorize(viewImport, row);
        const payload = await ctx.request.validateUsing(retryRowValidator);
        const error = await ProductImportError.find(payload.error_id);
        if (error === null || Number(error.importId) !== Number(row.id)) {
            return ctx.response.status(404).json({ errors: [{ message: "error row not found", code: "E_NOT_FOUND" }] });
        }
        error.originalValue = payload.value;
        error.retriedAt = DateTime.utc();
        error.retriedOutcome = "pending";
        await error.save();
        return resource(ProductImportErrorTransformer.transform(error));
    }

    /** `POST /api/v1/admin/products/import/{id}/retry-failed` — bulk retry of all error rows. */
    async retryFailed(ctx: HttpContext) {
        const row = await ProductImport.findOrFail(ctx.params.id);
        await ctx.bouncer.authorize(viewImport, row);
        const payload = await ctx.request.validateUsing(retryFailedValidator);
        const now = DateTime.utc();
        for (const edit of payload.edits) {
            const err = await ProductImportError.find(edit.error_id);
            if (err === null || Number(err.importId) !== Number(row.id)) continue;
            err.originalValue = edit.value;
            err.retriedAt = now;
            err.retriedOutcome = "pending";
            await err.save();
        }
        return { data: { queued: payload.edits.length } };
    }

    /**
     * `POST /api/v1/admin/products/import/{id}/rollback` — restore touched products from the
     * snapshot written before the run. After restoring, the import row's status flips to
     * `rolled_back` and Step 4 shows the red banner.
     */
    async rollback(ctx: HttpContext) {
        const row = await ProductImport.findOrFail(ctx.params.id);
        await ctx.bouncer.authorize(rollbackImport, row);
        if (row.rolledBackAt !== null) {
            return ctx.response.status(409).json({ errors: [{ message: "already rolled back", code: "E_CONFLICT" }] });
        }
        if (row.finishedAt === null) {
            return ctx.response.status(409).json({ errors: [{ message: "import not finished", code: "E_CONFLICT" }] });
        }
        const elapsedMs = Date.now() - row.finishedAt.toMillis();
        if (elapsedMs >= 24 * 60 * 60 * 1000) {
            return ctx.response.status(410).json({ errors: [{ message: "rollback window expired", code: "E_EXPIRED" }] });
        }

        const snapshot = await readSnapshot(Number(row.id));
        if (snapshot === null) {
            return ctx.response.status(404).json({ errors: [{ message: "snapshot missing", code: "E_NOT_FOUND" }] });
        }

        const db = await import("@adonisjs/lucid/services/db");
        await db.default.transaction(async (trx) => {
            for (const [sku, fields] of Object.entries(snapshot)) {
                const updates: Record<string, unknown> = {};
                for (const [field, value] of Object.entries(fields)) {
                    updates[field] = value;
                }
                if (Object.keys(updates).length === 0) continue;
                await trx.from("products").where("sku", sku).whereNull("deleted_at").update(updates);
            }
        });

        const actorId = Number(ctx.auth.user!.id);
        row.rolledBackAt = DateTime.utc();
        row.rolledBackByUserId = actorId;
        row.status = "rolled_back";
        await row.save();

        publishImportEvent({
            type: "rolled_back",
            importId: Number(row.id),
            at: new Date().toISOString(),
            payload: { byUserId: actorId },
        });

        return resource(ProductImportTransformer.transform(row));
    }

    /** `GET /api/v1/admin/products/import/history` — paginated history list. */
    async history(ctx: HttpContext) {
        const filters = await importHistoryQueryValidator.validate(ctx.request.qs());
        const query = ProductImport.query().orderBy("created_at", "desc");
        if (filters.status !== undefined) query.where("status", filters.status);
        if (filters.user_id !== undefined) query.where("user_id", filters.user_id);
        if (filters.preset_id !== undefined) query.where("preset_id", filters.preset_id);
        if (filters.from !== undefined) query.where("created_at", ">=", filters.from);
        if (filters.to !== undefined) query.where("created_at", "<=", filters.to);

        const page = Math.max(1, filters.page ?? 1);
        const perPage = Math.min(200, filters.per_page ?? 20);
        const paginator = await query.paginate(page, perPage);
        return paginated(ProductImportTransformer.transform(paginator.all()), paginator);
    }

    /** `GET /api/v1/admin/products/import/{id}/changes` — per-product diff log (history detail). */
    async changes(ctx: HttpContext) {
        const row = await ProductImport.findOrFail(ctx.params.id);
        await ctx.bouncer.authorize(viewImport, row);
        const query = ProductImportChange.query().where("import_id", Number(row.id)).orderBy("row_number", "asc");
        if (ctx.request.input("sku") !== undefined) {
            query.where("sku", ctx.request.input("sku") as string);
        }
        const page = Math.max(1, Number(ctx.request.input("page", 1)) || 1);
        const perPage = Math.min(500, Math.max(1, Number(ctx.request.input("per_page", 100)) || 100));
        const paginator = await query.paginate(page, perPage);
        return paginated(ProductImportChangeTransformer.transform(paginator.all()), paginator);
    }

    private async savePreset(
        headerHash: string,
        name: string,
        mapping: Record<string, string | null>,
        updateExisting: boolean,
        userId: number,
    ): Promise<void> {
        const existing = await ProductImportMappingPreset.query().where("header_hash", headerHash).where("name", name).first();
        if (existing === null) {
            const row = new ProductImportMappingPreset();
            row.headerHash = headerHash;
            row.name = name;
            row.mapping = mapping;
            row.updateExisting = updateExisting;
            row.createdByUserId = userId;
            row.lastUsedAt = DateTime.utc();
            row.useCount = 1;
            await row.save();
        } else {
            existing.mapping = mapping;
            existing.updateExisting = updateExisting;
            existing.lastUsedAt = DateTime.utc();
            existing.useCount += 1;
            await existing.save();
        }
    }

    private async touchAutoPreset(
        headerHash: string,
        mapping: Record<string, string | null>,
        updateExisting: boolean,
        userId: number,
    ): Promise<void> {
        const existing = await ProductImportMappingPreset.query().where("header_hash", headerHash).where("name", "auto").first();
        if (existing === null) {
            const row = new ProductImportMappingPreset();
            row.headerHash = headerHash;
            row.name = "auto";
            row.mapping = mapping;
            row.updateExisting = updateExisting;
            row.createdByUserId = userId;
            row.lastUsedAt = DateTime.utc();
            row.useCount = 1;
            await row.save();
        } else {
            existing.mapping = mapping;
            existing.updateExisting = updateExisting;
            existing.lastUsedAt = DateTime.utc();
            existing.useCount += 1;
            await existing.save();
        }
    }
}

function escapeCsv(value: string): string {
    const needsQuoting = /[,"\n\r]/.test(value);
    const escaped = value.replace(/"/g, '""');
    return needsQuoting ? `"${escaped}"` : escaped;
}
