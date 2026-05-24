"use client";

/**
 * Shape of the importer wizard state machine. The wizard drives a single page through 4 logical
 * steps (upload → mapping → importing → done) with an optional preview pass between mapping and
 * importing. State is held in the top-level `ImportWizard` component and threaded down to each
 * step view as props — no global store; the wizard is self-contained per route.
 */

import type { PreviewResult, ProductImportRow } from "#/lib/imports/types";

export type WizardStep = "upload" | "mapping" | "importing" | "done";

export interface UploadState {
    step: "upload";
}

export interface MappingState {
    step: "mapping";
    importRow: ProductImportRow;
    headers: string[];
    samples: Record<string, string[]>;
    presetMatch: { id: number; name: string; last_used_at: string | null } | null;
    mapping: Record<string, string | null>;
    updateExisting: boolean;
    preview: PreviewResult | null;
}

export interface ImportingState {
    step: "importing";
    importRow: ProductImportRow;
}

export interface DoneState {
    step: "done";
    importRow: ProductImportRow;
}

export type WizardState = UploadState | MappingState | ImportingState | DoneState;

export const INITIAL_STATE: WizardState = { step: "upload" };

/**
 * Map an import row's status into the wizard step the operator should land on. Used when the
 * route is hydrated with an `?id=` query parameter — e.g. the operator clicked the persistent
 * header badge to come back from a background-mode import.
 */
export function stepFromStatus(row: ProductImportRow): WizardStep {
    switch (row.status) {
        case "queued":
        case "validating":
            return row.processed_rows > 0 ? "importing" : "mapping";
        case "running":
            return "importing";
        case "completed":
        case "completed_with_errors":
        case "failed":
        case "cancelled":
        case "rolled_back":
            return "done";
        default:
            return "mapping";
    }
}
