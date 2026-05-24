import { createReadStream } from "node:fs";
import type { HttpContext } from "@adonisjs/core/http";
import logger from "@adonisjs/core/services/logger";
import db from "@adonisjs/lucid/services/db";
import { DateTime } from "luxon";

import ProductExport from "#models/product_export";
import ProductExportFilterPreset from "#models/product_export_filter_preset";
import { subscribeToExport, TERMINAL_EXPORT_EVENT_TYPES } from "#services/product_export/export_event_bus";
import { type ExportableProduct, resolveRow } from "#services/product_export/export_field_resolver";
import { buildExportQuery, type ExportFilters } from "#services/product_export/export_query_builder";
import { runExport } from "#services/product_export/export_runner";
import { mintSignedUrl, verifySignedUrl } from "#services/product_export/export_signed_url";
import { paginated, resource } from "#transformers/api_envelope";
import ProductExportFilterPresetTransformer from "#transformers/product_export_filter_preset_transformer";
import ProductExportTransformer from "#transformers/product_export_transformer";
import {
    distinctMetaKeysValidator,
    downloadExportValidator,
    exportFiltersValidator,
    exportHistoryQueryValidator,
    presetUpsertValidator,
    previewExportValidator,
    startExportValidator,
} from "#validators/admin/product_export_validator";

/**
 * `AdminProductExportsController` — every endpoint behind the export wizard. The controller is
 * thin: the query builder + runner + event bus do the heavy lifting. The SSE handler mirrors the
 * importer's verbatim (heartbeat every 15s, initial state event, terminal-event auto-close).
 *
 * Wire shape mirrors the importer: `{ data: row }` envelopes for single resources, `paginated`
 * envelopes for lists. Signed-URL download is the one exception — returns the file directly.
 */
export default class AdminProductExportsController {
    /** `GET /api/v1/admin/products/export/count` — live match count for the wizard's chip. */
    async count(ctx: HttpContext) {
        const filters = (await exportFiltersValidator.validate(ctx.request.qs())) as ExportFilters;
        const query = buildExportQuery(filters);
        const paginator = await query.paginate(1, 1);
        const products = paginator.total;
        const variations = filters.include_variations === true ? await countVariations(filters) : 0;
        return { data: { products, variations, total_rows: products + variations } };
    }

    /** `GET /api/v1/admin/products/export/preview` — first 5 matching products with chosen cols. */
    async preview(ctx: HttpContext) {
        const payload = await previewExportValidator.validate(ctx.request.qs());
        const filters = stripPreviewExtras(payload);
        const products = await buildExportQuery(filters)
            .preload("translations")
            .preload("images")
            .preload("categories", (sub) => sub.preload("translations"))
            .preload("tags", (sub) => sub.preload("translations"))
            .preload("brands", (sub) => sub.preload("translations"))
            .limit(5);

        const rows = products.map((product) => {
            const loose = product as unknown as Record<string, unknown>;
            return resolveRow(toExportable(loose, ctx.i18n.locale), payload.columns, {
                digit_style: payload.digit_style,
                date_format: payload.date_format,
                money_format: payload.money_format,
            });
        });

        return {
            data: {
                columns: payload.columns,
                rows,
            },
        };
    }

    /** `POST /api/v1/admin/products/export/start` — persist row + fire-and-forget runner. */
    async start(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(startExportValidator);
        const userId = Number(ctx.auth.user!.id);

        const row = new ProductExport();
        row.userId = userId;
        row.status = "queued";
        row.scope = (payload.scope as ProductExport["scope"]) ?? "filter";
        row.filters = stripStartExtras(payload) as unknown as Record<string, unknown>;
        row.columns = payload.columns as string[];
        row.formatOptions = pickFormatOptions(payload);
        if (payload.preset_id !== undefined) row.presetId = payload.preset_id as number;
        await row.save();

        if (payload.save_as_preset === true && payload.preset_name !== undefined) {
            await this.upsertPreset(userId, {
                name: payload.preset_name,
                filters: row.filters,
                columns: row.columns,
                format_options: row.formatOptions,
            });
        }

        void runExport({ exportId: Number(row.id), locale: ctx.i18n.locale }).catch((err) => {
            logger.error({ err, exportId: row.id }, "runExport: top-level rejection");
        });

        ctx.response.status(202);
        return resource(ProductExportTransformer.transform(row));
    }

    /**
     * `GET /api/v1/admin/products/export/{id}` — single export row (polling fallback).
     *
     * When the row is downloadable, also mints a fresh signed-URL token + persists its hash so
     * the wizard can render a working download link even when the SSE `complete` event was
     * missed (operator opened the page after the job finished, refreshed mid-stream, etc.).
     * Each call invalidates the previous token (rolling hash) — that's a security feature, not
     * a bug.
     */
    async show(ctx: HttpContext) {
        const row = await ProductExport.find(ctx.params.id);
        if (row === null || Number(row.userId) !== Number(ctx.auth.user!.id)) {
            return ctx.response.status(404).json({ errors: [{ message: "export not found", code: "E_NOT_FOUND" }] });
        }
        let token: string | null = null;
        if (
            row.status === "completed" &&
            row.filePath !== null &&
            row.downloadExpiresAt !== null &&
            row.downloadExpiresAt !== undefined &&
            Date.now() < row.downloadExpiresAt.toMillis()
        ) {
            const minted = mintSignedUrl({
                userId: Number(row.userId),
                exportId: Number(row.id),
                expiresAt: row.downloadExpiresAt.toMillis(),
            });
            row.downloadTokenHash = minted.hash;
            await row.save();
            token = minted.token;
        }
        const envelope = await resource(ProductExportTransformer.transform(row));
        return { ...envelope, download_token: token };
    }

    /**
     * `GET /api/v1/admin/products/export/{id}/stream` — SSE feed mirroring the importer's
     * handler. Sends an initial `reading_products`-or-current-state event so a late-joining
     * client sees the latest counters before the next chunk lands.
     */
    async stream(ctx: HttpContext) {
        const row = await ProductExport.find(ctx.params.id);
        if (row === null || Number(row.userId) !== Number(ctx.auth.user!.id)) {
            return ctx.response.status(404).json({ errors: [{ message: "export not found", code: "E_NOT_FOUND" }] });
        }

        const { response } = ctx;
        response.header("content-type", "text/event-stream");
        response.header("cache-control", "no-cache, no-transform");
        response.header("connection", "keep-alive");
        response.header("x-accel-buffering", "no");
        response.response.flushHeaders();

        const send = (event: { type: string; payload?: unknown; at?: string }) => {
            response.response.write(`event: ${event.type}\n`);
            response.response.write(`data: ${JSON.stringify(event)}\n\n`);
        };

        send({
            type: "reading_products",
            at: new Date().toISOString(),
            payload: {
                status: row.status,
                processed: row.processedRows,
                total: row.totalRows,
            },
        });

        if (TERMINAL_EXPORT_EVENT_TYPES.has(row.status as never)) {
            response.response.end();
            return;
        }

        const exportId = Number(row.id);
        let closed = false;
        const heartbeat = setInterval(() => {
            if (closed) return;
            response.response.write(": ping\n\n");
        }, 15_000);
        heartbeat.unref();

        const unsubscribe = subscribeToExport(exportId, (event) => {
            if (closed) return;
            send({ type: event.type, at: event.at, payload: event.payload });
            if (TERMINAL_EXPORT_EVENT_TYPES.has(event.type)) {
                closed = true;
                clearInterval(heartbeat);
                response.response.end();
            }
        });

        ctx.request.request.on("close", () => {
            closed = true;
            clearInterval(heartbeat);
            unsubscribe();
        });

        return new Promise<void>((resolve) => {
            ctx.request.request.on("close", resolve);
        });
    }

    /** `POST /api/v1/admin/products/export/{id}/cancel` — flag for the runner to observe. */
    async cancel(ctx: HttpContext) {
        const row = await ProductExport.find(ctx.params.id);
        if (row === null || Number(row.userId) !== Number(ctx.auth.user!.id)) {
            return ctx.response.status(404).json({ errors: [{ message: "export not found", code: "E_NOT_FOUND" }] });
        }
        if (row.cancellationRequestedAt === null) {
            row.cancellationRequestedAt = DateTime.utc();
            await row.save();
        }
        return resource(ProductExportTransformer.transform(row));
    }

    /**
     * `GET /api/v1/admin/products/export/{id}/download?token=…` — streams the file when the
     * signed token verifies. Refuses on mismatch / expiry / missing file. Unlike most other
     * endpoints, this returns the raw blob — the controller sets the headers and pipes the
     * read stream into the response.
     */
    async download(ctx: HttpContext) {
        const row = await ProductExport.find(ctx.params.id);
        if (row === null || Number(row.userId) !== Number(ctx.auth.user!.id)) {
            return ctx.response.status(404).json({ errors: [{ message: "export not found", code: "E_NOT_FOUND" }] });
        }
        const payload = await downloadExportValidator.validate(ctx.request.qs());
        const expiresAt = row.downloadExpiresAt;
        if (row.filePath === null || expiresAt === null || row.downloadTokenHash === null) {
            return ctx.response.status(410).json({ errors: [{ message: "file no longer available", code: "E_GONE" }] });
        }
        const verified = verifySignedUrl(
            { userId: Number(row.userId), exportId: Number(row.id), expiresAt: expiresAt.toMillis() },
            payload.token,
            row.downloadTokenHash,
        );
        if (!verified) {
            return ctx.response.status(403).json({ errors: [{ message: "invalid or expired token", code: "E_FORBIDDEN" }] });
        }

        const contentType = row.compressed
            ? "application/gzip"
            : row.formatOptions !== null && (row.formatOptions as Record<string, unknown>).format === "json"
              ? "application/json; charset=utf-8"
              : "text/csv; charset=utf-8";
        ctx.response.header("content-type", contentType);
        ctx.response.header("content-length", String(row.fileSizeBytes));
        const downloadName = row.compressed ? `${row.originalFilename}.gz` : row.originalFilename;
        ctx.response.header("content-disposition", `attachment; filename="${downloadName}"`);
        return createReadStream(row.filePath);
    }

    /** `GET /api/v1/admin/products/export/history` — paginated history (user-scoped). */
    async history(ctx: HttpContext) {
        const filters = await exportHistoryQueryValidator.validate(ctx.request.qs());
        const query = ProductExport.query().where("user_id", Number(ctx.auth.user!.id)).orderBy("created_at", "desc");
        if (filters.status !== undefined) query.where("status", filters.status);
        if (filters.from !== undefined) query.where("created_at", ">=", filters.from);
        if (filters.to !== undefined) query.where("created_at", "<=", filters.to);
        const page = Math.max(1, filters.page ?? 1);
        const perPage = Math.min(200, filters.per_page ?? 20);
        const paginator = await query.paginate(page, perPage);
        return paginated(ProductExportTransformer.transform(paginator.all()), paginator);
    }

    /** `DELETE /api/v1/admin/products/export/{id}` — soft remove from history (drops the file too). */
    async destroy(ctx: HttpContext) {
        const row = await ProductExport.find(ctx.params.id);
        if (row === null || Number(row.userId) !== Number(ctx.auth.user!.id)) {
            return ctx.response.status(404).json({ errors: [{ message: "export not found", code: "E_NOT_FOUND" }] });
        }
        if (row.filePath !== null && row.filePath !== undefined) {
            const { removeExportFile } = await import("#services/product_export/export_storage");
            await removeExportFile(row.filePath);
        }
        await row.delete();
        return ctx.response.status(204);
    }

    /** `GET /api/v1/admin/products/export/presets` — user's saved profiles. */
    async listPresets(ctx: HttpContext) {
        /**
         * `ORDER BY last_used_at DESC NULLS LAST, created_at DESC` — freshly-created presets
         * (`last_used_at IS NULL` until the operator picks them at least once) still appear at
         * the bottom of the most-recently-used pile, but never disappear from the dropdown.
         */
        const rows = await ProductExportFilterPreset.query()
            .where("user_id", Number(ctx.auth.user!.id))
            .orderByRaw("last_used_at DESC NULLS LAST")
            .orderBy("created_at", "desc");
        return { data: rows.map((r) => ProductExportFilterPresetTransformer.transform(r)) };
    }

    async createPreset(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(presetUpsertValidator);
        const preset = await this.upsertPreset(Number(ctx.auth.user!.id), payload);
        ctx.response.status(201);
        return resource(ProductExportFilterPresetTransformer.transform(preset));
    }

    async updatePreset(ctx: HttpContext) {
        const preset = await ProductExportFilterPreset.find(ctx.params.id);
        if (preset === null || Number(preset.userId) !== Number(ctx.auth.user!.id)) {
            return ctx.response.status(404).json({ errors: [{ message: "preset not found", code: "E_NOT_FOUND" }] });
        }
        const payload = await ctx.request.validateUsing(presetUpsertValidator);
        preset.name = payload.name;
        preset.filters = payload.filters;
        preset.columns = payload.columns as string[];
        preset.formatOptions = (payload.format_options ?? {}) as Record<string, unknown>;
        if (payload.is_default === true) {
            await ProductExportFilterPreset.query()
                .where("user_id", Number(preset.userId))
                .where("id", "!=", Number(preset.id))
                .update({ is_default: false });
            preset.isDefault = true;
        }
        await preset.save();
        return resource(ProductExportFilterPresetTransformer.transform(preset));
    }

    async destroyPreset(ctx: HttpContext) {
        const preset = await ProductExportFilterPreset.find(ctx.params.id);
        if (preset === null || Number(preset.userId) !== Number(ctx.auth.user!.id)) {
            return ctx.response.status(404).json({ errors: [{ message: "preset not found", code: "E_NOT_FOUND" }] });
        }
        await preset.delete();
        return ctx.response.status(204);
    }

    /**
     * `GET /api/v1/admin/products/distinct-meta-keys` — keys for the meta-column multi-select.
     * Reads from the `products.attributes` jsonb column (the importer/exporter's storage for
     * arbitrary meta) and de-dupes across the filtered product set. Hidden keys (prefix `_`) are
     * excluded unless `show_hidden=true`.
     */
    async distinctMetaKeys(ctx: HttpContext) {
        const payload = await distinctMetaKeysValidator.validate(ctx.request.qs());
        const showHidden = payload.show_hidden === true;
        const search = payload.search;

        /**
         * Inline subquery via `db.raw` keeps the meta-keys lookup honest with the user's active
         * filters — Knex's `.from(subquery)` typings cap at `string | Knex.Raw`, so we render
         * the subquery to SQL first and re-bind its bindings against the outer query.
         */
        const inner = buildExportQuery(stripDistinctExtras(payload)).select("attributes");
        const compiled = (inner as unknown as { toSQL: () => { sql: string; bindings: unknown[] } }).toSQL();
        const rows = (await db.rawQuery(
            `SELECT jsonb_object_keys(attributes) AS key FROM (${compiled.sql}) AS p GROUP BY key`,
            compiled.bindings as never,
        )) as unknown as { rows: Array<{ key: string }> };

        let keys = rows.rows.map((r) => r.key).filter((k) => typeof k === "string");
        if (!showHidden) keys = keys.filter((k) => !k.startsWith("_"));
        if (search !== undefined && search.trim() !== "") {
            const needle = search.toLowerCase();
            keys = keys.filter((k) => k.toLowerCase().includes(needle));
        }
        keys.sort();
        return { data: { keys: keys.map((key) => ({ key, count: 1 })) } };
    }

    /** Idempotent insert-or-update helper used by both the start endpoint and createPreset. */
    private async upsertPreset(
        userId: number,
        payload: {
            name: string;
            filters: Record<string, unknown>;
            columns: string[];
            format_options?: Record<string, unknown>;
            is_default?: boolean;
        },
    ): Promise<ProductExportFilterPreset> {
        const existing = await ProductExportFilterPreset.query().where("user_id", userId).where("name", payload.name).first();
        const row = existing ?? new ProductExportFilterPreset();
        row.userId = userId;
        row.name = payload.name;
        row.filters = payload.filters;
        row.columns = payload.columns;
        row.formatOptions = payload.format_options ?? {};
        row.lastUsedAt = DateTime.utc();
        if (payload.is_default === true) {
            await ProductExportFilterPreset.query()
                .where("user_id", userId)
                .where("id", "!=", existing !== null ? Number(existing.id) : -1)
                .update({ is_default: false });
            row.isDefault = true;
        } else if (existing === null) {
            row.isDefault = false;
        }
        await row.save();
        return row;
    }
}

async function countVariations(filters: ExportFilters): Promise<number> {
    const compiled = (
        buildExportQuery(filters).select("id") as unknown as { toSQL: () => { sql: string; bindings: unknown[] } }
    ).toSQL();
    const rows = (await db.rawQuery(
        `SELECT COUNT(*)::int AS total FROM product_variations WHERE deleted_at IS NULL AND product_id IN (${compiled.sql})`,
        compiled.bindings as never,
    )) as unknown as { rows: Array<{ total: number }> };
    return Number(rows.rows[0]?.total ?? 0);
}

function stripPreviewExtras(payload: Record<string, unknown>): ExportFilters {
    const { columns: _c, header_language: _h, digit_style: _ds, date_format: _df, money_format: _mf, ...rest } = payload;
    void _c;
    void _h;
    void _ds;
    void _df;
    void _mf;
    return rest as ExportFilters;
}

function stripStartExtras(payload: Record<string, unknown>): ExportFilters {
    const exclude = new Set([
        "scope",
        "columns",
        "header_language",
        "include_meta",
        "meta_strategy",
        "meta_min_count",
        "meta_keys",
        "show_hidden_meta",
        "format",
        "delimiter",
        "enclosure",
        "encoding",
        "line_ending",
        "digit_style",
        "date_format",
        "money_format",
        "compress",
        "redact_pii",
        "save_as_preset",
        "preset_name",
        "preset_id",
    ]);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload)) {
        if (!exclude.has(k)) out[k] = v;
    }
    return out as ExportFilters;
}

function stripDistinctExtras(payload: Record<string, unknown>): ExportFilters {
    const { show_hidden: _s, search: _q, ...rest } = payload;
    void _s;
    void _q;
    return rest as ExportFilters;
}

function pickFormatOptions(payload: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of [
        "header_language",
        "include_meta",
        "meta_strategy",
        "meta_min_count",
        "meta_keys",
        "show_hidden_meta",
        "format",
        "delimiter",
        "enclosure",
        "encoding",
        "line_ending",
        "digit_style",
        "date_format",
        "money_format",
        "compress",
        "redact_pii",
        "include_variations",
    ]) {
        if (payload[key] !== undefined) out[key] = payload[key];
    }
    return out;
}

function toExportable(product: Record<string, unknown>, locale: string): ExportableProduct {
    const translations = (product.translations ?? []) as Array<Record<string, unknown>>;
    const active =
        translations.find((t) => t.locale === locale) ?? translations.find((t) => t.locale === "en") ?? translations[0] ?? {};
    const categories = ((product.categories ?? []) as Array<Record<string, unknown>>).map((c) => {
        const ts = (c.translations ?? []) as Array<Record<string, unknown>>;
        const trans = ts.find((t) => t.locale === locale) ?? ts[0];
        return (trans?.name as string | undefined) ?? "";
    });
    const tags = ((product.tags ?? []) as Array<Record<string, unknown>>).map((t) => {
        const ts = (t.translations ?? []) as Array<Record<string, unknown>>;
        const trans = ts.find((tr) => tr.locale === locale) ?? ts[0];
        return (trans?.name as string | undefined) ?? "";
    });
    const brand = ((product.brands ?? []) as Array<Record<string, unknown>>)[0];
    const brandName = brand
        ? (() => {
              const ts = (brand.translations ?? []) as Array<Record<string, unknown>>;
              const trans = ts.find((tr) => tr.locale === locale) ?? ts[0];
              return (trans?.name as string | undefined) ?? null;
          })()
        : null;
    const images = ((product.images ?? []) as Array<Record<string, unknown>>).map((img) => (img.url as string | undefined) ?? "");

    return {
        id: product.id as number | bigint,
        sku: product.sku as string | null | undefined,
        name: active.name as string | undefined,
        slug: active.slug as string | undefined,
        description: active.description as string | undefined,
        short_description: active.shortDescription as string | undefined,
        type: product.type,
        status: product.status,
        visibility: product.catalogVisibility,
        featured: product.featured,
        regular_price: product.regularPrice,
        sale_price: product.salePrice,
        sale_price_start: product.saleStartsAt,
        sale_price_end: product.saleEndsAt,
        tax_status: product.taxStatus,
        weight_grams: product.weightGrams,
        length_mm: product.lengthMm,
        width_mm: product.widthMm,
        height_mm: product.heightMm,
        sold_individually: product.soldIndividually,
        allow_reviews: product.reviewsAllowed,
        external_url: product.externalUrl,
        menu_order: product.menuOrder,
        categories,
        tags,
        brand: brandName,
        images,
        meta: (product.attributes as Record<string, unknown> | undefined) ?? {},
    };
}
