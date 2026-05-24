import { PassThrough } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import app from "@adonisjs/core/services/app";
import drive from "@adonisjs/drive/services/main";

/**
 * Storage helpers for the exporter's artifacts. Backed by the `exports` Drive disk (configured
 * in `config/drive.ts`). Every site references files by **key**, so swapping the disk's driver
 * to S3/R2 later is a config-only change.
 *
 * The runner streams CSV/JSON rows out chunk by chunk; {@link openExportWriter} returns a
 * Node `PassThrough` the runner writes to and an `uploadDone` promise it awaits after `.end()`.
 * Internally, `drive.putStream(key, passthrough)` consumes the readable side concurrently — for
 * the `fs` driver that's just a `pipeline(passthrough, fs.createWriteStream(localPath))`, so
 * memory use stays flat regardless of export size.
 *
 * Cleanup contract: files older than 24h are pruned by a separate cleanup command (kept out of
 * scope here). Metadata in `product_exports` rows is kept for 90 days via the table's
 * `created_at` index.
 */

const DISK = "exports" as const;

/** Disk key for the raw export payload (uncompressed). */
export function exportKey(exportId: number, extension: ".csv" | ".json"): string {
    return `${exportId}-export${extension}`;
}

/** Disk key for the gzipped variant — base key with `.gz` appended. */
export function compressedExportKey(exportId: number, extension: ".csv" | ".json"): string {
    return `${exportKey(exportId, extension)}.gz`;
}

/** Resolve a disk key to an absolute fs path on the local `exports` disk (fs driver only). */
export function exportsLocalPath(key: string): string {
    return app.makePath("storage", "exports", key);
}

/**
 * Open a streaming writer into Drive. The runner writes header + rows into `stream`, then calls
 * `stream.end()` and awaits `uploadDone`. The disk consumes the readable side concurrently so
 * peak memory is whatever the chunk size is, not the whole file.
 */
export async function openExportWriter(
    exportId: number,
    extension: ".csv" | ".json",
): Promise<{ stream: PassThrough; key: string; uploadDone: Promise<void> }> {
    const key = exportKey(exportId, extension);
    const stream = new PassThrough();
    const uploadDone = drive.use(DISK).putStream(key, stream);
    return { stream, key, uploadDone };
}

/**
 * Gzip an already-stored export in place. Reads the source via `getStream`, pipes through
 * `createGzip`, writes the result back to the disk under `<sourceKey>.gz`, then deletes the
 * source on success. Returns the new key.
 */
export async function gzipExportKey(sourceKey: string): Promise<string> {
    const disk = drive.use(DISK);
    const destKey = `${sourceKey}.gz`;
    const sourceStream = await disk.getStream(sourceKey);
    const passthrough = new PassThrough();
    const uploadDone = disk.putStream(destKey, passthrough);
    await pipeline(sourceStream, createGzip(), passthrough);
    await uploadDone;
    try {
        await disk.delete(sourceKey);
    } catch {
        /** The compressed file is on disk; failing to delete the raw source is non-fatal. */
    }
    return destKey;
}

export async function fileSize(key: string): Promise<number> {
    try {
        const meta = await drive.use(DISK).getMetaData(key);
        return Number(meta.contentLength ?? 0);
    } catch {
        return 0;
    }
}

/** Idempotent delete — missing keys / permission errors swallowed. */
export async function deleteExportArtifact(key: string | null | undefined): Promise<void> {
    if (key === null || key === undefined || key === "") return;
    try {
        await drive.use(DISK).delete(key);
    } catch {
        /** Already-deleted or transient issues — non-fatal for cleanup paths. */
    }
}
