import app from "@adonisjs/core/services/app";
import drive from "@adonisjs/drive/services/main";

/**
 * Storage helpers for the importer's artifacts (uploaded CSV/XLSX, pre-import snapshot JSON,
 * completed error-report CSV). Backed by the `imports` Drive disk (configured in
 * `config/drive.ts`), so the file location is portable to S3/R2 later by swapping the disk's
 * driver — every site in the codebase references files by **key**, never absolute path.
 *
 * The one exception is {@link importsLocalPath}: the CSV/XLSX parser uses synchronous fs APIs
 * (`xlsx`'s `readFile`, `papaparse` over a Buffer) that need a real filesystem path. The helper
 * resolves a key against the locally-configured disk root. If the disk ever moves off `fs`, the
 * parser will need an async-stream refactor at the same time — this helper would go away.
 *
 * A scheduled cron (added separately) prunes anything older than 24h, matching the spec's
 * "uploaded file persists 24h server-side" guarantee.
 */

const DISK = "imports" as const;

/** Disk key for the operator's uploaded source file. Extension preserved for parser dispatch. */
export function uploadKey(importId: number, originalFilename: string): string {
    const ext = originalFilename.toLowerCase().endsWith(".xlsx") ? ".xlsx" : ".csv";
    return `${importId}-upload${ext}`;
}

/** Disk key for the pre-import snapshot blob that powers rollback. */
export function snapshotKey(importId: number): string {
    return `${importId}-snapshot.json`;
}

/** Disk key for the completed error-report CSV the wizard's download button serves. */
export function errorReportKey(importId: number): string {
    return `${importId}-errors.csv`;
}

/**
 * Resolve a disk key to its absolute filesystem path on the local `imports` disk. Only valid
 * while the configured driver is `fs`; see the module-level note.
 */
export function importsLocalPath(key: string): string {
    return app.makePath("storage", "imports", key);
}

/**
 * Snapshot shape — `{ sku: { field: previous_value } }`. Only fields the upcoming import will
 * touch are captured, so rollback restores precisely what was lost without disturbing other
 * columns the operator edited in the meantime.
 */
export type ImportSnapshot = Record<string, Record<string, string | number | boolean | null>>;

export async function writeSnapshot(importId: number, snapshot: ImportSnapshot): Promise<void> {
    await drive.use(DISK).put(snapshotKey(importId), JSON.stringify(snapshot));
}

export async function readSnapshot(importId: number): Promise<ImportSnapshot | null> {
    const disk = drive.use(DISK);
    const key = snapshotKey(importId);
    if (!(await disk.exists(key))) return null;
    try {
        const raw = await disk.get(key);
        return JSON.parse(raw) as ImportSnapshot;
    } catch {
        return null;
    }
}

/** Idempotent delete — missing keys / permission errors swallowed. */
export async function deleteImportArtifact(key: string | null | undefined): Promise<void> {
    if (key === null || key === undefined || key === "") return;
    try {
        await drive.use(DISK).delete(key);
    } catch {
        /** Already-deleted or transient issues — non-fatal for cleanup paths. */
    }
}

export async function fileSize(key: string): Promise<number> {
    try {
        const meta = await drive.use(DISK).getMetaData(key);
        return Number(meta.contentLength ?? 0);
    } catch {
        return 0;
    }
}
