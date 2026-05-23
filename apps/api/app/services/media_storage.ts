import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import type { MultipartFile } from "@adonisjs/core/bodyparser";
import app from "@adonisjs/core/services/app";

/**
 * Local-disk media storage. Uploads land under `apps/api/storage/uploads/{yyyy}/{mm}/{slug}.{ext}`
 * and are served by the public `GET /uploads/*` route. The hostname for the public URL is
 * derived from the incoming request so the value works both for the local spin
 * (`http://localhost:13467`) and any future deployment without needing a separate env var.
 *
 * Swap targets later: when moving to S3 / R2 the only surface that changes is this module —
 * controllers and tests touch nothing.
 *
 * @see {@link save} for the upload entry-point.
 * @see {@link resolveServePath} for the read-side path resolution (with traversal protection).
 */

/** Filesystem root for uploads, relative to the AdonisJS app root. */
const STORAGE_SUBPATH = "storage/uploads";

/** URL prefix served by the public `/uploads/*` route. */
const PUBLIC_PATH_PREFIX = "/uploads";

export interface SavedMediaFile {
    /** Absolute URL the browser can fetch. */
    url: string;
    /** Path under `storage/uploads/` (no leading slash), e.g. `2026/05/abc123.jpg`. */
    relativePath: string;
    /** Original filename as the user uploaded it (sanitized). */
    filename: string;
    /** Best-effort MIME type from the bodyparser, e.g. `image/jpeg` or `application/pdf`. */
    mime: string | null;
    /** File size in bytes, as reported by the bodyparser. */
    sizeBytes: number;
    /** `"image"` for image MIME types, `"file"` otherwise. */
    kind: "image" | "file";
}

/**
 * Sanitize a user-supplied filename. Strips path separators, collapses whitespace, drops
 * suspicious chars. Keeps the extension intact for MIME negotiation downstream.
 */
function sanitizeFilename(input: string | null | undefined): string {
    const safe = (input ?? "media")
        .replace(/[\\/]/g, "_")
        .replace(/\s+/g, "_")
        .replace(/[^A-Za-z0-9._-]/g, "_");
    return safe.length === 0 ? "media" : safe;
}

/** 16-byte random hex token, used to disambiguate uploaded filenames on disk. */
function makeStableId(): string {
    return randomBytes(16).toString("hex");
}

/**
 * Persist a single uploaded {@link MultipartFile} and return the metadata the controller needs
 * to insert a row. `request.host()` is passed in by the caller so the URL embedded in the DB
 * row matches whatever the browser used (`http://localhost:13467`, behind a reverse proxy, …).
 */
export async function save(file: MultipartFile, options: { host: string; protocol: string }): Promise<SavedMediaFile> {
    const now = new Date();
    const yyyy = String(now.getUTCFullYear());
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");

    const originalName = sanitizeFilename(file.clientName);
    const ext = extname(originalName) || (file.extname ? `.${file.extname}` : "");
    const stableId = makeStableId();
    const relativePath = `${yyyy}/${mm}/${stableId}${ext}`;

    const absoluteDir = app.makePath(STORAGE_SUBPATH, yyyy, mm);
    await fs.mkdir(absoluteDir, { recursive: true });
    await file.move(absoluteDir, { name: `${stableId}${ext}`, overwrite: false });

    const mime = inferMime(file);
    const kind: "image" | "file" = mime?.startsWith("image/") ? "image" : "file";

    return {
        url: `${options.protocol}://${options.host}${PUBLIC_PATH_PREFIX}/${relativePath}`,
        relativePath,
        filename: originalName,
        mime,
        sizeBytes: file.size ?? 0,
        kind,
    };
}

/**
 * Compose the MIME type from the bodyparser parts. Adonis stores `type/subtype` separately on
 * `MultipartFile`; the headers may already carry a full string, so we prefer that when present.
 */
function inferMime(file: MultipartFile): string | null {
    if (typeof file.headers?.["content-type"] === "string" && file.headers["content-type"].length > 0) {
        return file.headers["content-type"].split(";")[0]?.trim() ?? null;
    }
    if (file.type && file.subtype) return `${file.type}/${file.subtype}`;
    return null;
}

/**
 * Resolve a `/uploads/...` request to an absolute file-system path under the storage root.
 * Returns `null` for any path that escapes the root (path traversal, absolute paths in the
 * request, weird `..` segments). The `/uploads/*` route uses this to safely stream files back.
 */
export function resolveServePath(requestedSegments: readonly string[]): string | null {
    if (requestedSegments.length === 0) return null;
    const joined = requestedSegments.join("/");
    if (joined.includes("..") || joined.startsWith("/")) return null;
    const root = resolve(app.makePath(STORAGE_SUBPATH));
    const absolute = resolve(root, joined);
    const rootWithSep = root.endsWith(sep) ? root : `${root}${sep}`;
    if (absolute !== root && !absolute.startsWith(rootWithSep)) return null;
    return absolute;
}

/**
 * Delete the file backing a media row. Best-effort: missing files are silently ignored so a
 * partial cleanup doesn't bubble a 500 to the caller. The DB row deletion is the source of
 * truth — orphaned files on disk are harmless and can be reaped by a future cron.
 */
export async function deleteFile(url: string): Promise<void> {
    const prefix = PUBLIC_PATH_PREFIX.replace(/\/+$/, "");
    const marker = `${prefix}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) return;
    const relative = url.slice(idx + marker.length);
    if (relative.length === 0) return;
    const target = resolveServePath(relative.split("/"));
    if (target === null) return;
    try {
        await fs.unlink(target);
    } catch {
        /* swallow */
    }
    const parent = dirname(target);
    try {
        const entries = await fs.readdir(parent);
        if (entries.length === 0) await fs.rmdir(parent);
    } catch {
        /* swallow */
    }
}

export const MEDIA_PUBLIC_PATH_PREFIX = PUBLIC_PATH_PREFIX;

/** Re-exported only for unit tests so they can construct expected paths without duplicating the constant. */
export function storageRoot(): string {
    return resolve(app.makePath(STORAGE_SUBPATH));
}

/** Re-export for tests asserting on disk layout (`storage/uploads/2026/05/...`). */
export function storagePathFor(relative: string): string {
    return join(storageRoot(), relative);
}
