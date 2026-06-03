import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import type { MultipartFile } from "@adonisjs/core/bodyparser";
import app from "@adonisjs/core/services/app";
import sharp from "sharp";

import { currentTenantId } from "#services/tenant_context";
import type { VariantSpec } from "#transformers/media_settings_transformer";

/**
 * Local-disk media storage. Uploads land under
 * `apps/api/storage/uploads/t{tenantId}/{yyyy}/{mm}/{slug}.{ext}` and are served by the public
 * `GET /uploads/*` route. The hostname for the public URL is derived from the incoming request so
 * the value works both for the local spin (`http://localhost:13467`) and any future deployment
 * without needing a separate env var.
 *
 * **Tenant isolation** is physical: every file lives under a per-tenant `t{tenantId}/` segment
 * (the first path component) and the stored `url` embeds it, so one tenant's files can never sit in
 * another's directory and the segment in the public URL IS the serving namespace. Combined with the
 * unguessable random `stableId` filename and the `media.tenant_id` RLS row guard, a tenant can
 * neither list nor address another's uploads. See {@link resolveServePath} for the read side.
 *
 * Swap targets later: when moving to S3 / R2 the only surface that changes is this module —
 * controllers and tests touch nothing.
 *
 * @see {@link save} for the upload entry-point.
 * @see {@link resolveServePath} for the read-side path resolution (with traversal protection).
 */

/** Filesystem root for uploads, relative to the AdonisJS app root. */
const STORAGE_SUBPATH = "storage/uploads";

/** Per-tenant first path component, e.g. `t100000`. The serving namespace lives here. */
function tenantPathSegment(): string {
    return `t${String(currentTenantId())}`;
}

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
    /** Pixel width of the original raster image, or `null` for non-rasters / failed decode. */
    width: number | null;
    /** Pixel height of the original raster image, or `null` for non-rasters / failed decode. */
    height: number | null;
    /** Generated resized renditions keyed by preset name (`thumbnail` / `medium` / `large`). */
    variants: Record<string, SavedVariant>;
}

/** A generated resized rendition's public URL + output dimensions. */
export interface SavedVariant {
    url: string;
    width: number;
    height: number;
}

/** Image-processing inputs derived from the Media settings group (see `toMediaUploadConfig`). */
export interface ImageProcessOptions {
    /** When `false`, write to the flat `storage/uploads/` root instead of `{yyyy}/{mm}`. */
    organizeByDate: boolean;
    /** Resized renditions to generate from the original (skipped for SVG/GIF/non-images). */
    variants: VariantSpec[];
}

/** MIME types we never run through sharp — vector + animated formats resize poorly or not at all. */
const NON_RASTER = new Set(["image/svg+xml", "image/gif"]);

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
export async function save(
    file: MultipartFile,
    options: { host: string; protocol: string; images?: ImageProcessOptions },
): Promise<SavedMediaFile> {
    const organizeByDate = options.images?.organizeByDate ?? true;
    const now = new Date();
    const yyyy = String(now.getUTCFullYear());
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const dirSegments = [tenantPathSegment(), ...(organizeByDate ? [yyyy, mm] : [])];
    const relativeDir = dirSegments.join("/");

    const originalName = sanitizeFilename(file.clientName);
    const ext = extname(originalName) || (file.extname ? `.${file.extname}` : "");
    const stableId = makeStableId();
    const fileName = `${stableId}${ext}`;
    const relativePath = relativeDir.length > 0 ? `${relativeDir}/${fileName}` : fileName;

    const absoluteDir = app.makePath(STORAGE_SUBPATH, ...dirSegments);
    await fs.mkdir(absoluteDir, { recursive: true });
    await file.move(absoluteDir, { name: fileName, overwrite: false });

    const mime = inferMime(file);
    const kind: "image" | "file" = mime?.startsWith("image/") ? "image" : "file";
    const publicUrl = (rel: string) => `${options.protocol}://${options.host}${PUBLIC_PATH_PREFIX}/${rel}`;

    const processed = await processImage({
        absoluteDir,
        relativeDir,
        stableId,
        ext,
        mime,
        variants: options.images?.variants ?? [],
        publicUrl,
    });

    return {
        url: publicUrl(relativePath),
        relativePath,
        filename: originalName,
        mime,
        sizeBytes: file.size ?? 0,
        kind,
        width: processed.width,
        height: processed.height,
        variants: processed.variants,
    };
}

/** Extension → MIME for filesystem ingestion (no bodyparser to infer from). */
const EXT_MIME: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
};

/**
 * Ingest a file already on disk (e.g. a committed seed asset) into media storage — the
 * request-less twin of {@link save}. Copies the source into `storage/uploads/…`, generates the
 * configured variants with sharp, and returns the same {@link SavedMediaFile} shape so seeders /
 * import scripts produce rows identical to real uploads. `baseUrl` is the API origin used to build
 * absolute public URLs (seeders have no request to derive a host from).
 */
export async function ingestFile(
    sourceAbsPath: string,
    options: { baseUrl: string; organizeByDate?: boolean; variants?: VariantSpec[]; filename?: string },
): Promise<SavedMediaFile> {
    const organizeByDate = options.organizeByDate ?? true;
    const now = new Date();
    const yyyy = String(now.getUTCFullYear());
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const dirSegments = [tenantPathSegment(), ...(organizeByDate ? [yyyy, mm] : [])];
    const relativeDir = dirSegments.join("/");

    const ext = extname(sourceAbsPath).toLowerCase();
    const stableId = makeStableId();
    const fileName = `${stableId}${ext}`;
    const relativePath = relativeDir.length > 0 ? `${relativeDir}/${fileName}` : fileName;

    const absoluteDir = app.makePath(STORAGE_SUBPATH, ...dirSegments);
    await fs.mkdir(absoluteDir, { recursive: true });
    const originalAbs = join(absoluteDir, fileName);
    await fs.copyFile(sourceAbsPath, originalAbs);
    const stat = await fs.stat(originalAbs);

    const mime = EXT_MIME[ext] ?? null;
    const kind: "image" | "file" = mime?.startsWith("image/") ? "image" : "file";
    const base = options.baseUrl.replace(/\/+$/, "");
    const publicUrl = (rel: string) => `${base}${PUBLIC_PATH_PREFIX}/${rel}`;

    let result = { width: null as number | null, height: null as number | null, variants: {} as Record<string, SavedVariant> };
    if (options.variants !== undefined && mime?.startsWith("image/") && !NON_RASTER.has(mime)) {
        const variantUrlFor = (name: string) => {
            const file = `${stableId}-${name}${ext}`;
            return publicUrl(relativeDir.length > 0 ? `${relativeDir}/${file}` : file);
        };
        try {
            result = await generateRenditions(originalAbs, ext, options.variants, variantUrlFor);
        } catch {
            /* leave dimensions null + no variants on decode failure */
        }
    }

    return {
        url: publicUrl(relativePath),
        relativePath,
        filename: options.filename ?? basename(sourceAbsPath),
        mime,
        sizeBytes: stat.size,
        kind,
        width: result.width,
        height: result.height,
        variants: result.variants,
    };
}

interface ProcessImageInput {
    absoluteDir: string;
    relativeDir: string;
    stableId: string;
    ext: string;
    mime: string | null;
    variants: VariantSpec[];
    publicUrl: (rel: string) => string;
}

/**
 * Read the original's dimensions and generate the configured resized renditions with sharp.
 * Best-effort: a decode failure (corrupt upload, exotic codec) leaves dimensions `null` and
 * variants empty rather than failing the upload — the original file is already safely on disk.
 * Non-raster MIME types (SVG, GIF) and non-images skip processing entirely.
 */
async function processImage(
    input: ProcessImageInput,
): Promise<{ width: number | null; height: number | null; variants: Record<string, SavedVariant> }> {
    const { absoluteDir, relativeDir, stableId, ext, mime, variants, publicUrl } = input;
    const empty = { width: null, height: null, variants: {} };
    if (mime === null || !mime.startsWith("image/") || NON_RASTER.has(mime)) return empty;

    const originalAbs = join(absoluteDir, `${stableId}${ext}`);
    const variantUrlFor = (name: string) => {
        const file = `${stableId}-${name}${ext}`;
        return publicUrl(relativeDir.length > 0 ? `${relativeDir}/${file}` : file);
    };
    try {
        return await generateRenditions(originalAbs, ext, variants, variantUrlFor);
    } catch {
        return empty;
    }
}

/**
 * Generate the resized renditions for an already-on-disk original. Shared by the upload path and
 * the `media:regenerate-variants` backfill. Writes each variant beside the original as
 * `{base}-{name}{ext}` and returns its public URL (via `variantUrlFor`) + output dimensions.
 */
async function generateRenditions(
    originalAbs: string,
    ext: string,
    variants: VariantSpec[],
    variantUrlFor: (name: string) => string,
): Promise<{ width: number | null; height: number | null; variants: Record<string, SavedVariant> }> {
    const base = originalAbs.slice(0, originalAbs.length - ext.length);
    const meta = await sharp(originalAbs).metadata();
    const out: Record<string, SavedVariant> = {};
    for (const v of variants) {
        const fit: sharp.ResizeOptions = v.crop
            ? { fit: "cover", position: "centre" }
            : { fit: "inside", withoutEnlargement: true };
        const info = await sharp(originalAbs).resize(v.width, v.height, fit).toFile(`${base}-${v.name}${ext}`);
        out[v.name] = { url: variantUrlFor(v.name), width: info.width, height: info.height };
    }
    return { width: meta.width ?? null, height: meta.height ?? null, variants: out };
}

/**
 * Regenerate variants for an existing media row from its stored `url`. Returns `null` when the URL
 * isn't a locally-served upload (external / seeded rows) or the original file is missing on disk.
 * Used by `node ace media:regenerate-variants` to backfill rows uploaded before the resize pipeline.
 */
export async function regenerateVariants(
    url: string,
    variants: VariantSpec[],
): Promise<{ width: number | null; height: number | null; variants: Record<string, SavedVariant> } | null> {
    const marker = `${PUBLIC_PATH_PREFIX}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    const relative = url.slice(idx + marker.length);
    if (relative.length === 0) return null;
    const originalAbs = resolveServePath(relative.split("/"));
    if (originalAbs === null) return null;
    try {
        await fs.access(originalAbs);
    } catch {
        return null;
    }
    const ext = extname(originalAbs);
    const urlBase = url.slice(0, url.length - ext.length);
    return generateRenditions(originalAbs, ext, variants, (name) => `${urlBase}-${name}${ext}`);
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
    const ext = extname(target);
    const base = target.slice(0, target.length - ext.length);
    for (const name of ["thumbnail", "medium", "large"]) {
        try {
            await fs.unlink(`${base}-${name}${ext}`);
        } catch {
            /* variant may not exist — swallow */
        }
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
