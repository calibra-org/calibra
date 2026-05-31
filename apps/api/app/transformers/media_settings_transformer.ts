/**
 * Media settings transformer + derivation helpers. Projects the `media` settings group into the
 * typed shape the admin Media tab consumes, and derives the upload-time variant config the media
 * storage pipeline applies. Defaults mirror the seeded `media` group (WordPress's thumbnail/medium/
 * large sizes) so an empty store still resizes sanely.
 */

export interface VariantSpec {
    name: "thumbnail" | "medium" | "large";
    width: number;
    height: number;
    /** When true, hard-crop to exact dimensions (`cover`); otherwise fit within bounds. */
    crop: boolean;
}

export interface MediaUploadConfig {
    organizeByDate: boolean;
    maxUploadMb: number;
    variants: VariantSpec[];
}

const DEFAULTS = {
    thumbnail_width: 150,
    thumbnail_height: 150,
    thumbnail_crop: true,
    medium_width: 300,
    medium_height: 300,
    large_width: 1024,
    large_height: 1024,
    organize_uploads_by_date: true,
    max_upload_mb: 20,
} as const;

function num(media: Record<string, unknown>, key: keyof typeof DEFAULTS): number {
    return typeof media[key] === "number" ? (media[key] as number) : (DEFAULTS[key] as number);
}

function flag(media: Record<string, unknown>, key: keyof typeof DEFAULTS): boolean {
    return typeof media[key] === "boolean" ? (media[key] as boolean) : (DEFAULTS[key] as boolean);
}

/** Assemble the admin `GET /api/v1/admin/settings/media` response from the `media` group. */
export function toMediaSettings(media: Record<string, unknown>) {
    return {
        thumbnail: {
            width: num(media, "thumbnail_width"),
            height: num(media, "thumbnail_height"),
            crop: flag(media, "thumbnail_crop"),
        },
        medium: {
            width: num(media, "medium_width"),
            height: num(media, "medium_height"),
        },
        large: {
            width: num(media, "large_width"),
            height: num(media, "large_height"),
        },
        uploads: {
            organize_by_date: flag(media, "organize_uploads_by_date"),
            max_upload_mb: num(media, "max_upload_mb"),
        },
    };
}

/**
 * Derive the upload pipeline config (variant specs + organize flag + size cap) from the `media`
 * settings group. Consumed by the media upload controller so a settings change takes effect on the
 * next upload without code edits.
 */
export function toMediaUploadConfig(media: Record<string, unknown>): MediaUploadConfig {
    return {
        organizeByDate: flag(media, "organize_uploads_by_date"),
        maxUploadMb: num(media, "max_upload_mb"),
        variants: [
            {
                name: "thumbnail",
                width: num(media, "thumbnail_width"),
                height: num(media, "thumbnail_height"),
                crop: flag(media, "thumbnail_crop"),
            },
            { name: "medium", width: num(media, "medium_width"), height: num(media, "medium_height"), crop: false },
            { name: "large", width: num(media, "large_width"), height: num(media, "large_height"), crop: false },
        ],
    };
}
