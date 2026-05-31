import type { AdminMedia, AdminMediaVariantName, AdminMediaVariants } from "#/lib/types";

/**
 * Pick the smallest variant whose URL we should render for a given display size, falling back to
 * progressively larger renditions and finally the full original. Centralizes the "don't ship a
 * 1024px original into a 40px cell" rule so every render site stays optimized.
 *
 * `thumbnail` (~150px) for list/grid cells, avatars, option rows; `medium` (~300px) for cards and
 * pickers; `large` (~1024px) for detail heroes / full previews; `full` only when the operator
 * genuinely needs the original (download, lightbox).
 */
export type MediaDisplaySize = AdminMediaVariantName | "full";

/** Fallback order per requested size — try the ideal, then the next sensible rendition, then original. */
const FALLBACK_CHAIN: Record<MediaDisplaySize, AdminMediaVariantName[]> = {
    thumbnail: ["thumbnail", "medium", "large"],
    medium: ["medium", "large", "thumbnail"],
    large: ["large", "medium"],
    full: [],
};

/** Resolve a variant URL from a loose `{ url, variants }` shape (works for media rows + image refs). */
export function variantUrl(
    source: { url: string; variants?: AdminMediaVariants | null } | null | undefined,
    size: MediaDisplaySize,
): string {
    if (source === null || source === undefined) return "";
    const variants = source.variants;
    if (variants) {
        for (const name of FALLBACK_CHAIN[size]) {
            const hit = variants[name];
            if (hit?.url) return hit.url;
        }
    }
    return source.url;
}

/** Convenience wrapper for a full {@link AdminMedia} row. */
export function mediaVariantUrl(media: Pick<AdminMedia, "url" | "variants">, size: MediaDisplaySize): string {
    return variantUrl(media, size);
}
