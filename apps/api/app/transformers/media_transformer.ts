import { BaseTransformer } from "@adonisjs/core/transformers";

import type Media from "#models/media";

/**
 * Public shape for media rows. Surfaces the editable library fields (title, alt, caption,
 * description) plus the technical bits the admin UI needs to render previews and file pickers
 * (`mime`, `width`, `height`, `size_bytes`, `filename`). `filename` is derived from the URL when
 * the column is `NULL` — the seeded Picsum rows have no original filename, so we synthesize one
 * from the URL slug for display.
 */
export default class MediaTransformer extends BaseTransformer<Media> {
    toObject() {
        const m = this.resource;
        const created = m.createdAt;
        const updated = m.updatedAt;
        return {
            id: Number(m.id),
            kind: m.kind,
            url: m.url,
            filename: m.filename ?? deriveFilename(m.url),
            title: m.title,
            alt: m.alt,
            caption: m.caption,
            description: m.description,
            mime: m.mime,
            width: m.width,
            height: m.height,
            variants: extractVariants(m.attributes),
            size_bytes: m.sizeBytes !== null && m.sizeBytes !== undefined ? Number(m.sizeBytes) : null,
            uploaded_by_user_id:
                m.uploadedByUserId !== null && m.uploadedByUserId !== undefined ? Number(m.uploadedByUserId) : null,
            created_at: created !== null && created !== undefined ? created.toISO() : null,
            updated_at: updated !== null && updated !== undefined ? updated.toISO() : null,
        };
    }
}

interface MediaVariant {
    url: string;
    width: number;
    height: number;
}

/**
 * Pull the generated resize renditions out of the media row's `attributes` JSONB. Returns `null`
 * for rows with no variants (non-images, SVG/GIF, legacy rows uploaded before the resize pipeline).
 */
function extractVariants(attributes: unknown): Record<string, MediaVariant> | null {
    if (attributes !== null && typeof attributes === "object" && "variants" in attributes) {
        const variants = (attributes as { variants?: unknown }).variants;
        if (variants !== null && typeof variants === "object" && Object.keys(variants).length > 0) {
            return variants as Record<string, MediaVariant>;
        }
    }
    return null;
}

/**
 * Strip the URL down to a usable filename for legacy / seeded rows that have no stored filename.
 * Drops the query string, then the leading path. If the trailing segment looks substantive (has
 * a dot extension, or at least mixes letters), use it. Otherwise walk back one segment — the
 * Picsum-style URLs (`/seed/foo-1/600/600`) end in the dimension token, so the actual identifier
 * lives one level up.
 */
function deriveFilename(url: string): string {
    const withoutQuery = url.split("?")[0] ?? url;
    const segments = withoutQuery.split("/").filter((segment) => segment.length > 0);
    if (segments.length === 0) return "media";
    const last = segments[segments.length - 1] ?? "media";
    if (looksLikeFilename(last)) return last;
    const previous = segments[segments.length - 2];
    if (previous !== undefined && looksLikeFilename(previous)) return previous;
    return previous ?? last;
}

/**
 * Pure-digit segments (e.g. an image-server's `/600/600` size suffix) aren't meaningful filenames.
 * Anything with at least one letter, OR a dot extension, qualifies.
 */
function looksLikeFilename(segment: string): boolean {
    if (segment.includes(".")) return true;
    return /[A-Za-z]/.test(segment);
}
