"use client";

/**
 * Shape of the importer wizard state machine. The wizard drives a single page through 5 logical
 * steps:
 *
 *   1. `upload`     — operator drops / pastes / picks the CSV or XLSX file.
 *   2. `mapping`    — operator confirms / tweaks the column ↔ field mapping the auto-mapper
 *                     suggested.
 *   3. `review`     — dedicated step (NOT inline like WooCommerce does it) where the operator
 *                     sees what the run *would* do and toggles per-outcome controls — skip-new,
 *                     skip-update, skip-warning-rows, update-existing — before pulling the
 *                     trigger.
 *   4. `importing`  — runner streams chunked progress + counters.
 *   5. `done`       — summary, editable error rows + per-row retry, undo banner.
 *
 * Review is intentionally its own step (not the WP-style "scroll down past the table"). It gives
 * the operator a focused workspace to decide on the import's scope without the noisy mapping
 * table competing for attention.
 *
 * State is held in the top-level `ImportWizard` component and threaded down to each step view
 * as props — no global store; the wizard is self-contained per route.
 */

import type { PreviewResult, ProductImportRow } from "#/lib/imports/types";

export type WizardStep = "upload" | "mapping" | "review" | "importing" | "done";

/**
 * Per-outcome filters the review step exposes. Each toggle scopes the actual run; the runner
 * checks them and reroutes matching rows into `skipped_count`. Defaults import everything that
 * would otherwise import.
 */
export interface ReviewControls {
    /** When `true`, rows that would have been a CREATE are skipped (not inserted). */
    skipNew: boolean;
    /** When `true`, rows that would have been an UPDATE are skipped (existing row left alone). */
    skipUpdates: boolean;
    /** When `true`, rows touched by an anomaly warning are skipped — operator wants to play it safe. */
    skipWarningRows: boolean;
    /** Drives the SKU-collision branch in the runner. Mirrors the toggle from Step 1; the operator can change their mind here. */
    updateExisting: boolean;
}

export function defaultReviewControls(updateExisting: boolean): ReviewControls {
    return {
        skipNew: false,
        skipUpdates: false,
        skipWarningRows: false,
        updateExisting,
    };
}

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
}

export interface ReviewState {
    step: "review";
    importRow: ProductImportRow;
    headers: string[];
    samples: Record<string, string[]>;
    presetMatch: { id: number; name: string; last_used_at: string | null } | null;
    mapping: Record<string, string | null>;
    preview: PreviewResult;
    controls: ReviewControls;
}

export interface ImportingState {
    step: "importing";
    importRow: ProductImportRow;
}

export interface DoneState {
    step: "done";
    importRow: ProductImportRow;
}

export type WizardState = UploadState | MappingState | ReviewState | ImportingState | DoneState;

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
