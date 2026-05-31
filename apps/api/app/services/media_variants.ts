/**
 * Resolve the best variant URL for a media row at a requested display size, falling back through
 * larger renditions and finally the original. Lets transformers emit an already-sized URL for
 * small render contexts (list thumbnails, option rows) so the admin never ships a 1024px original
 * into a 40px cell. Mirrors the frontend `mediaVariantUrl` fallback chain.
 */
type VariantName = "thumbnail" | "medium" | "large";

interface MediaLike {
    url?: string | null;
    attributes?: unknown;
}

const FALLBACK_CHAIN: Record<VariantName, VariantName[]> = {
    thumbnail: ["thumbnail", "medium", "large"],
    medium: ["medium", "large", "thumbnail"],
    large: ["large", "medium"],
};

function readVariants(attributes: unknown): Record<string, { url?: string }> | null {
    if (attributes !== null && typeof attributes === "object" && "variants" in attributes) {
        const variants = (attributes as { variants?: unknown }).variants;
        if (variants !== null && typeof variants === "object") return variants as Record<string, { url?: string }>;
    }
    return null;
}

/** Raw variants object (`{ thumbnail, medium, large }`) from a media row, or `null` when absent. */
export function readMediaVariants(
    media: MediaLike | null | undefined,
): Record<string, { url: string; width: number; height: number }> | null {
    if (media === null || media === undefined) return null;
    return readVariants(media.attributes) as Record<string, { url: string; width: number; height: number }> | null;
}

/** Best variant URL for `size`, or the original `url`, or `null` when the media is absent. */
export function pickVariantUrl(media: MediaLike | null | undefined, size: VariantName): string | null {
    if (media === null || media === undefined) return null;
    const variants = readVariants(media.attributes);
    if (variants !== null) {
        for (const name of FALLBACK_CHAIN[size]) {
            const hit = variants[name];
            if (hit?.url) return hit.url;
        }
    }
    return media.url ?? null;
}
