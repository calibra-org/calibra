/**
 * Anomaly detector — runs over the projected rows during preview and surfaces non-blocking amber
 * warnings the operator should sanity-check before they hit "ندرک دراو عورش". Mirrors UX mandate
 * point 7 from the spec:
 *
 * - Price change >50% on an update row
 * - Duplicate SKU within the *same* CSV (whichever appears later wins)
 * - Outlier price (≥10× column median)
 * - Missing required-on-create fields (name, regular_price) for a row that will be a create
 * - Column-type mismatch (e.g. text in a numeric column) — already surfaced via row errors but
 *   the detector also reports the count so the warnings tab can lead the eye there
 */

import type { ProductImportDTO, ProjectionError } from "#services/product_import/row_projector";

export interface AnomalyFinding {
    code:
        | "price_jump"
        | "price_drop"
        | "duplicate_sku_in_file"
        | "outlier_price"
        | "missing_required_on_create"
        | "type_mismatch";
    /** Localized message — formatted by the runner via `ctx.i18n` before being returned. */
    message: string;
    /** 1-indexed (header counted) row numbers the finding applies to. */
    rowNumbers: number[];
    sku?: string;
    field?: string;
}

export interface PreviewRow {
    rowNumber: number;
    dto: ProductImportDTO;
    errors: ProjectionError[];
    /**
     * `null` until the runner has done its existing-SKU lookup. The detector treats `existingPrice`
     * as the baseline for the price-jump check; if the lookup hasn't happened yet (e.g. pure-CSV
     * dry-run with no DB access), the price-jump check is skipped for that row.
     */
    existingRegularPriceMajor: number | null;
}

export function detectAnomalies(rows: PreviewRow[]): AnomalyFinding[] {
    const findings: AnomalyFinding[] = [];

    findings.push(...detectDuplicateSkus(rows));
    findings.push(...detectPriceJumps(rows));
    findings.push(...detectOutlierPrices(rows));
    findings.push(...detectMissingRequiredOnCreate(rows));
    findings.push(...detectTypeMismatches(rows));

    return findings;
}

function detectDuplicateSkus(rows: PreviewRow[]): AnomalyFinding[] {
    const seen = new Map<string, number[]>();
    for (const row of rows) {
        const sku = row.dto.sku;
        if (sku === undefined || sku === null || sku === "") continue;
        const key = String(sku).trim();
        if (!seen.has(key)) seen.set(key, []);
        seen.get(key)!.push(row.rowNumber);
    }
    const findings: AnomalyFinding[] = [];
    for (const [sku, occurrences] of seen) {
        if (occurrences.length > 1) {
            findings.push({
                code: "duplicate_sku_in_file",
                message: `duplicate SKU ${sku} appears ${occurrences.length} times — only the last wins`,
                rowNumbers: occurrences,
                sku,
            });
        }
    }
    return findings;
}

function detectPriceJumps(rows: PreviewRow[]): AnomalyFinding[] {
    const findings: AnomalyFinding[] = [];
    for (const row of rows) {
        const newPrice = row.dto.regular_price_major;
        const oldPrice = row.existingRegularPriceMajor;
        if (newPrice === undefined || newPrice === null) continue;
        if (oldPrice === null || oldPrice === 0) continue;
        const ratio = newPrice / oldPrice;
        if (ratio >= 1.5) {
            findings.push({
                code: "price_jump",
                message: `price for ${row.dto.sku ?? "?"} increased ${(ratio * 100 - 100).toFixed(0)}%`,
                rowNumbers: [row.rowNumber],
                sku: row.dto.sku ?? undefined,
                field: "regular_price",
            });
        } else if (ratio <= 0.5) {
            findings.push({
                code: "price_drop",
                message: `price for ${row.dto.sku ?? "?"} dropped ${(100 - ratio * 100).toFixed(0)}%`,
                rowNumbers: [row.rowNumber],
                sku: row.dto.sku ?? undefined,
                field: "regular_price",
            });
        }
    }
    return findings;
}

function detectOutlierPrices(rows: PreviewRow[]): AnomalyFinding[] {
    const prices = rows
        .map((r) => r.dto.regular_price_major)
        .filter((p): p is number => typeof p === "number" && Number.isFinite(p));
    if (prices.length < 5) return [];
    const median = computeMedian(prices);
    if (median === 0) return [];
    const outliers: AnomalyFinding[] = [];
    for (const row of rows) {
        const price = row.dto.regular_price_major;
        if (typeof price !== "number") continue;
        const ratio = price / median;
        if (ratio >= 10 || ratio <= 0.1) {
            outliers.push({
                code: "outlier_price",
                message: `price ${price} is ${ratio.toFixed(1)}× the column median ${median}`,
                rowNumbers: [row.rowNumber],
                sku: row.dto.sku ?? undefined,
                field: "regular_price",
            });
        }
    }
    return outliers;
}

function detectMissingRequiredOnCreate(rows: PreviewRow[]): AnomalyFinding[] {
    const findings: AnomalyFinding[] = [];
    for (const row of rows) {
        const isCreate = row.existingRegularPriceMajor === null;
        if (!isCreate) continue;
        if (row.dto.name === undefined || row.dto.name === "") {
            findings.push({
                code: "missing_required_on_create",
                message: `row will be a CREATE but has no product name`,
                rowNumbers: [row.rowNumber],
                sku: row.dto.sku ?? undefined,
                field: "name",
            });
        }
        if (row.dto.regular_price_major === undefined || row.dto.regular_price_major === null) {
            findings.push({
                code: "missing_required_on_create",
                message: `row will be a CREATE but has no regular_price`,
                rowNumbers: [row.rowNumber],
                sku: row.dto.sku ?? undefined,
                field: "regular_price",
            });
        }
    }
    return findings;
}

function detectTypeMismatches(rows: PreviewRow[]): AnomalyFinding[] {
    const byColumn = new Map<string, number[]>();
    for (const row of rows) {
        for (const err of row.errors) {
            if (
                err.code === "invalid_price"
                || err.code === "invalid_stock"
                || err.code === "invalid_boolean"
                || err.code === "invalid_date"
                || err.code === "invalid_url"
            ) {
                if (!byColumn.has(err.columnName)) byColumn.set(err.columnName, []);
                byColumn.get(err.columnName)!.push(row.rowNumber);
            }
        }
    }
    const findings: AnomalyFinding[] = [];
    for (const [column, rowNumbers] of byColumn) {
        if (rowNumbers.length >= 3) {
            findings.push({
                code: "type_mismatch",
                message: `column "${column}" has ${rowNumbers.length} cells that don't parse to its target type`,
                rowNumbers,
                field: column,
            });
        }
    }
    return findings;
}

function computeMedian(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) return (sorted[mid - 1]! + sorted[mid]!) / 2;
    return sorted[mid]!;
}
