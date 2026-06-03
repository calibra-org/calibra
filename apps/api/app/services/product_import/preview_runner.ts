import { resolveCurrencyConfig } from "#services/currency_config_service";
import { type AnomalyFinding, detectAnomalies, type PreviewRow } from "#services/product_import/anomaly_detector";
import { parseFile } from "#services/product_import/csv_parser";
import { type ColumnMapping, type ProjectionError, projectRow } from "#services/product_import/row_projector";
import { currentTrx } from "#services/tenant_context";

/**
 * `runPreview` — the dry-run pass that powers the Step 2.5 "شیامنش‌یپ" panel. Does NO database
 * writes. Parses the uploaded file, projects every row, looks up matching SKUs to figure out
 * create-vs-update, builds the "first 10 updates" diff list, and runs the anomaly detector.
 *
 * The operator can re-run this as often as they want — no real import slot is consumed and no
 * counters move.
 */

export interface PreviewDiff {
    field: string;
    oldValue: string | null;
    newValue: string | null;
    percentChange: number | null;
}

export interface PreviewUpdate {
    sku: string;
    rowNumber: number;
    diffs: PreviewDiff[];
}

export interface PreviewFailure {
    rowNumber: number;
    sku: string | null;
    columnName: string | null;
    code: string;
    message: string;
    originalValue: string | null;
}

/**
 * One skipped row, with the machine-readable reason the preview decided to skip it. Codes are a
 * subset of the runner's outcome codes — the wizard renders a localized label for each so the
 * operator sees *why* every skipped row was skipped, not just a count.
 */
export interface PreviewSkip {
    rowNumber: number;
    sku: string | null;
    /**
     * - `duplicate_sku` — a product with this SKU already exists and `update_existing` is off.
     * - `empty_row` — none of the mapped columns held content for this row.
     * - `all_columns_unmapped` — the row had data but no column maps to a real field.
     */
    code: "duplicate_sku" | "empty_row" | "all_columns_unmapped";
}

export interface PreviewResult {
    totals: {
        create: number;
        update: number;
        skip: number;
        fail: number;
        warnings: number;
    };
    updatesPreview: PreviewUpdate[];
    warnings: AnomalyFinding[];
    failures: PreviewFailure[];
    skips: PreviewSkip[];
}

export interface PreviewOptions {
    filePath: string;
    mapping: ColumnMapping;
    updateExisting: boolean;
    delimiter: string;
    encoding: string;
    /** How many update rows to expand inline in the panel. */
    expandedUpdates?: number;
    /** How many failure rows to expand. */
    expandedFailures?: number;
}

const DEFAULT_EXPANSION = 10;

export async function runPreview(opts: PreviewOptions): Promise<PreviewResult> {
    const parsed = await parseFile(opts.filePath, {
        delimiter: opts.delimiter === "auto" ? "auto" : opts.delimiter,
        encoding: opts.encoding === "auto" ? "auto" : opts.encoding,
    });
    /** Store display-currency base_ratio — converts `*_major` ↔ BASE minor for the preview diffs. */
    const baseRatio = (await resolveCurrencyConfig()).baseRatio;

    const projectedRows: Array<{
        rowNumber: number;
        dto: ReturnType<typeof projectRow>["dto"];
        errors: ProjectionError[];
        hasContent: boolean;
    }> = [];

    for (let i = 0; i < parsed.rows.length; i++) {
        const projection = projectRow(parsed.rows[i]!, opts.mapping);
        projectedRows.push({ rowNumber: i + 2, ...projection });
    }

    const skusToLookUp = new Set<string>();
    for (const row of projectedRows) {
        const sku = row.dto.sku;
        if (typeof sku === "string" && sku.trim() !== "") {
            skusToLookUp.add(sku.trim());
        }
    }
    const existingMap = await fetchExistingProducts(Array.from(skusToLookUp));

    let create = 0;
    let update = 0;
    let skip = 0;
    let fail = 0;
    const failures: PreviewFailure[] = [];
    const skips: PreviewSkip[] = [];
    const updates: PreviewUpdate[] = [];
    const previewRows: PreviewRow[] = [];

    /** No-op: spec point — the `images` field on a row can have data without being mapped. */
    const hasAnyMapped = Object.values(opts.mapping).some((v) => v !== null);

    for (const row of projectedRows) {
        const sku = typeof row.dto.sku === "string" ? row.dto.sku.trim() : "";
        const existing = sku === "" ? undefined : existingMap.get(sku);

        if (row.errors.length > 0) {
            fail++;
            for (const err of row.errors) {
                failures.push({
                    rowNumber: row.rowNumber,
                    sku: sku === "" ? null : sku,
                    columnName: err.columnName,
                    code: err.code,
                    message: err.message,
                    originalValue: err.originalValue,
                });
            }
            previewRows.push({
                rowNumber: row.rowNumber,
                dto: row.dto,
                errors: row.errors,
                existingRegularPriceMajor: existing === undefined ? null : minorToMajor(existing.regularPrice, baseRatio),
            });
            continue;
        }

        if (!row.hasContent) {
            skip++;
            skips.push({
                rowNumber: row.rowNumber,
                sku: sku === "" ? null : sku,
                code: hasAnyMapped ? "empty_row" : "all_columns_unmapped",
            });
            continue;
        }

        if (existing !== undefined) {
            if (!opts.updateExisting) {
                skip++;
                skips.push({ rowNumber: row.rowNumber, sku, code: "duplicate_sku" });
                continue;
            }
            update++;
            const diffs = buildDiffs(existing, row.dto, baseRatio);
            if (updates.length < (opts.expandedUpdates ?? DEFAULT_EXPANSION) && diffs.length > 0) {
                updates.push({ sku, rowNumber: row.rowNumber, diffs });
            }
        } else {
            if (sku === "" && (row.dto.name === undefined || row.dto.name === "")) {
                fail++;
                failures.push({
                    rowNumber: row.rowNumber,
                    sku: null,
                    columnName: "name",
                    code: "missing_sku_on_update",
                    message: "row has no SKU and no name — cannot create",
                    originalValue: null,
                });
            } else {
                create++;
            }
        }

        previewRows.push({
            rowNumber: row.rowNumber,
            dto: row.dto,
            errors: row.errors,
            existingRegularPriceMajor: existing === undefined ? null : minorToMajor(existing.regularPrice, baseRatio),
        });
    }

    const warnings = detectAnomalies(previewRows);

    return {
        totals: { create, update, skip, fail, warnings: warnings.length },
        updatesPreview: updates,
        warnings,
        failures: failures.slice(0, opts.expandedFailures ?? DEFAULT_EXPANSION),
        skips: skips.slice(0, opts.expandedFailures ?? DEFAULT_EXPANSION),
    };
}

interface ExistingProduct {
    id: number;
    sku: string;
    regularPrice: number | null;
    salePrice: number | null;
    status: string;
    type: string;
}

async function fetchExistingProducts(skus: string[]): Promise<Map<string, ExistingProduct>> {
    const result = new Map<string, ExistingProduct>();
    if (skus.length === 0) return result;
    const chunks: string[][] = [];
    for (let i = 0; i < skus.length; i += 500) chunks.push(skus.slice(i, i + 500));
    for (const chunk of chunks) {
        const rows = await currentTrx()
            .from("products")
            .whereNull("deleted_at")
            .whereIn("sku", chunk)
            .select("id", "sku", "regular_price", "sale_price", "status", "type");
        for (const row of rows as Array<Record<string, unknown>>) {
            const sku = row.sku as string;
            result.set(sku, {
                id: Number(row.id),
                sku,
                regularPrice: row.regular_price === null ? null : Number(row.regular_price),
                salePrice: row.sale_price === null ? null : Number(row.sale_price),
                status: row.status as string,
                type: row.type as string,
            });
        }
    }
    return result;
}

function buildDiffs(existing: ExistingProduct, dto: ReturnType<typeof projectRow>["dto"], baseRatio: number): PreviewDiff[] {
    const diffs: PreviewDiff[] = [];

    if (dto.regular_price_major !== undefined) {
        const newMinor = dto.regular_price_major === null ? null : Math.round(dto.regular_price_major * baseRatio);
        if (newMinor !== existing.regularPrice) {
            diffs.push({
                field: "regular_price",
                oldValue: existing.regularPrice === null ? null : String(existing.regularPrice),
                newValue: newMinor === null ? null : String(newMinor),
                percentChange: percentChange(existing.regularPrice, newMinor),
            });
        }
    }
    if (dto.sale_price_major !== undefined) {
        const newMinor = dto.sale_price_major === null ? null : Math.round(dto.sale_price_major * baseRatio);
        if (newMinor !== existing.salePrice) {
            diffs.push({
                field: "sale_price",
                oldValue: existing.salePrice === null ? null : String(existing.salePrice),
                newValue: newMinor === null ? null : String(newMinor),
                percentChange: percentChange(existing.salePrice, newMinor),
            });
        }
    }
    if (dto.status !== undefined && dto.status !== existing.status) {
        diffs.push({ field: "status", oldValue: existing.status, newValue: dto.status, percentChange: null });
    }
    if (dto.type !== undefined && dto.type !== existing.type) {
        diffs.push({ field: "type", oldValue: existing.type, newValue: dto.type, percentChange: null });
    }
    if (dto.name !== undefined) {
        diffs.push({ field: "name", oldValue: null, newValue: dto.name, percentChange: null });
    }

    return diffs;
}

function percentChange(oldValue: number | null, newValue: number | null): number | null {
    if (oldValue === null || newValue === null || oldValue === 0) return null;
    return ((newValue - oldValue) / oldValue) * 100;
}

function minorToMajor(minor: number | null, baseRatio: number): number | null {
    if (minor === null) return null;
    return Math.round(minor / baseRatio);
}
