import { mkdir, writeFile, unlink, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

import app from "@adonisjs/core/services/app";

/**
 * Storage helpers for the importer's on-disk artifacts. Files live under `storage/imports/` —
 * uploaded CSV/XLSX, pre-import snapshot JSON, completed error-report CSV. All files are owned by
 * the api process (private — never served directly; the controller streams them through
 * authenticated endpoints).
 *
 * A scheduled cron (added separately) prunes anything older than 24h, matching the spec's
 * "uploaded file persists 24h server-side" guarantee.
 */

/** Absolute path of the imports storage root. */
export function importsRoot(): string {
    return app.makePath("storage", "imports");
}

/** Ensure the imports root exists. Safe to call repeatedly. */
export async function ensureImportsRoot(): Promise<void> {
    await mkdir(importsRoot(), { recursive: true });
}

export function uploadedFilePath(importId: number, originalFilename: string): string {
    const ext = originalFilename.toLowerCase().endsWith(".xlsx") ? ".xlsx" : ".csv";
    return join(importsRoot(), `${importId}-upload${ext}`);
}

export function snapshotPath(importId: number): string {
    return join(importsRoot(), `${importId}-snapshot.json`);
}

export function errorReportPath(importId: number): string {
    return join(importsRoot(), `${importId}-errors.csv`);
}

/**
 * Snapshot shape — `{ sku: { field: previous_value } }`. Only fields the upcoming import will
 * touch are captured, so rollback restores precisely what was lost without disturbing other
 * columns the operator edited in the meantime.
 */
export type ImportSnapshot = Record<string, Record<string, string | number | boolean | null>>;

export async function writeSnapshot(importId: number, snapshot: ImportSnapshot): Promise<void> {
    const path = snapshotPath(importId);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(snapshot), "utf-8");
}

export async function readSnapshot(importId: number): Promise<ImportSnapshot | null> {
    const path = snapshotPath(importId);
    try {
        const raw = await readFile(path, "utf-8");
        return JSON.parse(raw) as ImportSnapshot;
    } catch {
        return null;
    }
}

export async function removeImportFile(path: string | null | undefined): Promise<void> {
    if (path === null || path === undefined || path === "") return;
    try {
        await unlink(path);
    } catch {
        /** Already-deleted or permission issues are non-fatal here. */
    }
}

export async function fileSize(path: string): Promise<number> {
    try {
        const st = await stat(path);
        return st.size;
    } catch {
        return 0;
    }
}
