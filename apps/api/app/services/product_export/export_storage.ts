import { createReadStream, createWriteStream, type WriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import app from "@adonisjs/core/services/app";

/**
 * Storage helpers for the exporter's on-disk artifacts. Mirrors the importer's `storage.ts`
 * pattern — files live under `storage/exports/`, owned by the api process, never served
 * directly (the download endpoint streams them via authenticated + signed-URL handler).
 *
 * Cleanup contract: files older than 24h are pruned by the `ace product-exports:cleanup`
 * command (ops wires it to system cron — Adonis 7 has no built-in scheduler in this repo
 * yet). Metadata in `product_exports` rows is kept for 90 days; the table's `created_at`
 * index supports a separate retention sweep.
 */

export function exportsRoot(): string {
    return app.makePath("storage", "exports");
}

export async function ensureExportsRoot(): Promise<void> {
    await mkdir(exportsRoot(), { recursive: true });
}

/** Build the deterministic absolute path for an export's raw payload. */
export function exportFilePath(exportId: number, extension: ".csv" | ".json"): string {
    return join(exportsRoot(), `${exportId}-export${extension}`);
}

/** Same path with the `.gz` suffix appended — the runner renames after compression. */
export function compressedExportFilePath(exportId: number, extension: ".csv" | ".json"): string {
    return `${exportFilePath(exportId, extension)}.gz`;
}

/** Open a writable stream for the export's payload. Returns the underlying file path too. */
export async function openExportWriter(
    exportId: number,
    extension: ".csv" | ".json",
): Promise<{ stream: WriteStream; path: string }> {
    await ensureExportsRoot();
    const path = exportFilePath(exportId, extension);
    const stream = createWriteStream(path, { encoding: "utf-8" });
    return { stream, path };
}

/**
 * Gzip a file in place and return the compressed path. Removes the original on success so the
 * download endpoint serves the .gz blob directly. Used only when the runner decides to compress
 * (size > 5 MB by default, or always/never per the operator's choice).
 */
export async function gzipFile(sourcePath: string): Promise<string> {
    const destPath = `${sourcePath}.gz`;
    await pipeline(createReadStream(sourcePath), createGzip(), createWriteStream(destPath));
    await unlink(sourcePath).catch(() => undefined);
    return destPath;
}

export async function fileSize(path: string): Promise<number> {
    try {
        const st = await stat(path);
        return st.size;
    } catch {
        return 0;
    }
}

export async function removeExportFile(path: string | null | undefined): Promise<void> {
    if (path === null || path === undefined || path === "") return;
    try {
        await unlink(path);
    } catch {
        /** Already-deleted or permission issues — non-fatal here. */
    }
}
