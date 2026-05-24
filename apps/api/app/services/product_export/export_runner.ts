import logger from "@adonisjs/core/services/logger";
import { DateTime } from "luxon";

import ProductExport from "#models/product_export";
import { publishExportEvent } from "#services/product_export/export_event_bus";
import type { ExportableProduct } from "#services/product_export/export_field_resolver";
import { buildExportQuery, type ExportFilters } from "#services/product_export/export_query_builder";
import { createRowEmitter, type EmitterOptions } from "#services/product_export/export_row_emitter";
import { mintSignedUrl } from "#services/product_export/export_signed_url";
import { fileSize, gzipFile, openExportWriter } from "#services/product_export/export_storage";

/**
 * Top-level orchestrator for an export run. Same shape as `import_runner.ts`:
 *
 *   1. Set status = "running", publish `reading_products` with the total row count.
 *   2. Open a writable stream to `storage/exports/{id}-export.csv` (or `.json`).
 *   3. Iterate the matched products via Lucid `.paginate` chunks of 50, preloading the
 *      relations the field resolver needs (translations + categories + tags + brand +
 *      images + optionally variations).
 *   4. Per chunk: check cancellation flag, emit one row per product (+ one per variation when
 *      `include_variations`), update DB counters, publish `chunk_complete`.
 *   5. Close stream. Compress (gzip) when size > 5 MB (or per the operator's choice).
 *   6. Mint the signed download URL, persist the hash + expiry on the row, publish `complete`.
 *
 * The function is fire-and-forget from the controller's POV (`void runExport(...).catch(...)`),
 * so it returns once the run terminates. Any unhandled exception is caught at the top, written
 * to the row's `exception` column, and surfaced as a terminal `failed` event.
 */

const CHUNK_SIZE = 50;
const DOWNLOAD_TTL_MS = 24 * 60 * 60 * 1000;
const COMPRESS_THRESHOLD_BYTES = 5 * 1024 * 1024;

export interface RunExportOptions {
    exportId: number;
    locale: string;
}

export async function runExport(opts: RunExportOptions): Promise<void> {
    const row = await ProductExport.find(opts.exportId);
    if (row === null) {
        logger.warn({ exportId: opts.exportId }, "runExport: export row missing — abort");
        return;
    }

    try {
        row.status = "running";
        row.startedAt = DateTime.utc();
        await row.save();

        const filters = (row.filters ?? {}) as ExportFilters;
        const columns = row.columns ?? [];
        const formatOptions = (row.formatOptions ?? {}) as Partial<EmitterOptions> & {
            include_variations?: boolean;
            compress?: "auto" | "always" | "never";
        };

        const includeVariations = filters.has_variations === true || formatOptions.include_variations === true;
        const extension = formatOptions.format === "json" ? ".json" : ".csv";

        const countPaginator = await buildExportQuery(filters).paginate(1, 1);
        const totalProducts = countPaginator.total;

        row.totalRows = totalProducts;
        await row.save();

        publishExportEvent({
            type: "reading_products",
            exportId: opts.exportId,
            at: new Date().toISOString(),
            payload: { total_products: totalProducts },
        });

        const writer = await openExportWriter(opts.exportId, extension);
        const filename = `products-${opts.exportId}-${Date.now()}${extension}`;
        row.originalFilename = filename;
        row.filePath = writer.path;
        await row.save();

        const emitter = createRowEmitter(columns, normalizeEmitterOptions(formatOptions));
        writer.stream.write(emitter.writeHeader());

        let processed = 0;
        let page = 1;
        const perPage = CHUNK_SIZE;

        for (;;) {
            if (await isCancellationRequested(opts.exportId)) {
                writer.stream.end();
                row.status = "cancelled";
                row.finishedAt = DateTime.utc();
                await row.save();
                publishExportEvent({
                    type: "cancelled",
                    exportId: opts.exportId,
                    at: new Date().toISOString(),
                });
                return;
            }

            const query = buildExportQuery(filters)
                .preload("translations")
                .preload("images")
                .preload("categories", (sub) => sub.preload("translations"))
                .preload("tags", (sub) => sub.preload("translations"))
                .preload("brands", (sub) => sub.preload("translations"));

            if (includeVariations) {
                query.preload("variations");
            }

            const paginator = await query.orderBy("id", "asc").paginate(page, perPage);
            const products = paginator.all();
            if (products.length === 0) break;

            publishExportEvent({
                type: "chunk_start",
                exportId: opts.exportId,
                at: new Date().toISOString(),
                payload: { offset: processed, size: products.length },
            });

            for (const product of products) {
                const loose = product as unknown as Record<string, unknown>;
                writer.stream.write(emitter.appendRow(toExportable(loose, opts.locale)));
                processed++;
                if (includeVariations && Array.isArray(loose.variations)) {
                    for (const variation of loose.variations as Array<Record<string, unknown>>) {
                        writer.stream.write(emitter.appendRow(toExportableVariation(loose, variation)));
                    }
                }
            }

            row.processedRows = processed;
            await row.save();

            publishExportEvent({
                type: "chunk_complete",
                exportId: opts.exportId,
                at: new Date().toISOString(),
                payload: { processed, total: totalProducts },
            });

            if (paginator.currentPage >= paginator.lastPage) break;
            page++;
        }

        writer.stream.write(emitter.close());
        await new Promise<void>((resolve, reject) => {
            writer.stream.end((err: NodeJS.ErrnoException | null | undefined) => (err ? reject(err) : resolve()));
        });

        let finalPath = writer.path;
        const rawSize = await fileSize(finalPath);
        const wantCompress = decideCompress(formatOptions.compress ?? "auto", rawSize);
        if (wantCompress) {
            publishExportEvent({
                type: "compressing",
                exportId: opts.exportId,
                at: new Date().toISOString(),
            });
            finalPath = await gzipFile(finalPath);
            row.compressed = true;
        }
        row.filePath = finalPath;
        row.fileSizeBytes = wantCompress ? await fileSize(finalPath) : rawSize;

        const expiresAt = Date.now() + DOWNLOAD_TTL_MS;
        const signed = mintSignedUrl({ userId: Number(row.userId), exportId: Number(row.id), expiresAt });
        row.downloadTokenHash = signed.hash;
        row.downloadExpiresAt = DateTime.fromMillis(expiresAt);

        row.status = "completed";
        row.finishedAt = DateTime.utc();
        await row.save();

        publishExportEvent({
            type: "complete",
            exportId: opts.exportId,
            at: new Date().toISOString(),
            payload: {
                file_size: row.fileSizeBytes,
                row_count: processed,
                compressed: wantCompress,
                token: signed.token,
            },
        });
    } catch (err) {
        logger.error({ err, exportId: opts.exportId }, "runExport: unhandled exception");
        const message = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
        row.status = "failed";
        row.finishedAt = DateTime.utc();
        row.exception = message;
        await row.save();
        publishExportEvent({
            type: "failed",
            exportId: opts.exportId,
            at: new Date().toISOString(),
            payload: { message },
        });
    }
}

function normalizeEmitterOptions(opts: Partial<EmitterOptions> & Record<string, unknown>): EmitterOptions {
    return {
        format: opts.format === "json" ? "json" : "csv",
        delimiter: (opts.delimiter as EmitterOptions["delimiter"] | undefined) ?? ",",
        enclosure: (opts.enclosure as string | undefined) ?? '"',
        encoding: (opts.encoding as EmitterOptions["encoding"] | undefined) ?? "utf-8-bom",
        line_ending: (opts.line_ending as EmitterOptions["line_ending"] | undefined) ?? "\n",
        header_language: (opts.header_language as "en" | "fa" | undefined) ?? "en",
        digit_style: (opts.digit_style as "ascii" | "persian" | undefined) ?? "ascii",
        date_format: (opts.date_format as "iso" | "jalali" | "ddmmyyyy" | undefined) ?? "iso",
        money_format: (opts.money_format as "minor" | "major" | undefined) ?? "minor",
    };
}

function decideCompress(mode: "auto" | "always" | "never", rawSize: number): boolean {
    if (mode === "always") return true;
    if (mode === "never") return false;
    return rawSize > COMPRESS_THRESHOLD_BYTES;
}

async function isCancellationRequested(exportId: number): Promise<boolean> {
    const row = await ProductExport.find(exportId);
    return row !== null && row.cancellationRequestedAt !== null && row.cancellationRequestedAt !== undefined;
}

/**
 * Project a Lucid `Product` into the flat shape the field resolver consumes. Picks the active
 * locale's translation for `name`/`description`/`short_description`/`slug`, joins category paths
 * into `"A > B"` strings, and so on. Keeps the resolver pure (no Lucid types crossing the
 * boundary).
 */
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

function toExportableVariation(parent: Record<string, unknown>, variation: Record<string, unknown>): ExportableProduct {
    return {
        id: variation.id as number | bigint,
        sku: variation.sku as string | null | undefined,
        parent_sku: parent.sku as string | null | undefined,
        type: "variation",
        status: parent.status,
        regular_price: variation.regularPrice,
        sale_price: variation.salePrice,
    };
}
