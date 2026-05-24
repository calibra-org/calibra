"use client";

/**
 * State machine for the export wizard. Four steps to mirror the importer's UX rhythm:
 *
 *   1. `filter`     — operator picks scope (all / filter / selected) + filters + columns + format.
 *   2. `review`     — dedicated workspace showing the actual 5-row preview + a chance to tweak
 *                     digit_style / date_format / money_format / header_language before pulling
 *                     the trigger. Mirrors the import wizard's deliberate "review before commit"
 *                     pattern.
 *   3. `exporting`  — runner streams progress.
 *   4. `done`       — summary + download.
 */

import { DEFAULT_EXPORT_COLUMNS } from "#/lib/exports/default-columns";
import type {
    ExportFilters,
    ExportFormatOptions,
    ExportPreviewResult,
    ProductExportRow,
    ProductExportScope,
} from "#/lib/exports/types";

export type WizardStep = "filter" | "review" | "exporting" | "done";

export interface FilterState {
    step: "filter";
    scope: ProductExportScope;
    filters: ExportFilters;
    columns: string[];
    format: ExportFormatOptions;
    selectedIds: number[];
}

export interface ReviewState {
    step: "review";
    scope: ProductExportScope;
    filters: ExportFilters;
    columns: string[];
    format: ExportFormatOptions;
    selectedIds: number[];
    preview: ExportPreviewResult;
    matchCount: { products: number; variations: number; total_rows: number };
}

export interface ExportingState {
    step: "exporting";
    exportRow: ProductExportRow;
}

export interface DoneState {
    step: "done";
    exportRow: ProductExportRow;
    /** Signed-URL token the runner returned on `complete`. Drives the download link. */
    token: string | null;
}

export type WizardState = FilterState | ReviewState | ExportingState | DoneState;

export function initialFilterState(scope: ProductExportScope = "filter", selectedIds: number[] = []): FilterState {
    return {
        step: "filter",
        scope,
        filters: {},
        columns: [...DEFAULT_EXPORT_COLUMNS],
        format: {
            format: "csv",
            delimiter: ",",
            encoding: "utf-8-bom",
            line_ending: "\n",
            digit_style: "ascii",
            date_format: "iso",
            money_format: "minor",
            compress: "auto",
            header_language: "en",
        },
        selectedIds,
    };
}

export function stepFromStatus(row: ProductExportRow): WizardStep {
    switch (row.status) {
        case "queued":
        case "running":
            return "exporting";
        case "completed":
        case "completed_with_errors":
        case "failed":
        case "cancelled":
            return "done";
        default:
            return "filter";
    }
}
