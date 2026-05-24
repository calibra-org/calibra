"use client";

/**
 * State machine for the export wizard. Three steps, much simpler than the importer's:
 *
 *   1. `filter`     — operator picks scope (all / filter / selected) + filters + columns + format.
 *   2. `exporting`  — runner streams progress.
 *   3. `done`       — summary + download.
 *
 * State is held in the top-level `ExportWizard`; each step view receives a slice as props.
 */

import { DEFAULT_EXPORT_COLUMNS } from "#/lib/exports/default-columns";
import type { ExportFilters, ExportFormatOptions, ProductExportRow, ProductExportScope } from "#/lib/exports/types";

export type WizardStep = "filter" | "exporting" | "done";

export interface FilterState {
    step: "filter";
    scope: ProductExportScope;
    filters: ExportFilters;
    columns: string[];
    format: ExportFormatOptions;
    selectedIds: number[];
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

export type WizardState = FilterState | ExportingState | DoneState;

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
