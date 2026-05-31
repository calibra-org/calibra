import vine from "@vinejs/vine";

/** Pixel dimension bounds for an image-size preset. */
const dimension = () => vine.number().withoutDecimals().min(1).max(4096).optional();

/**
 * PATCH body for `PATCH /api/v1/admin/settings/media`. Every section and field is optional — the
 * controller writes only what changed (same-value writes are no-ops). Widths/heights are pixel
 * bounds; `max_upload_mb` caps a single upload (1–100 MB).
 */
export const adminMediaSettingsUpdateValidator = vine.compile(
    vine.object({
        thumbnail: vine
            .object({
                width: dimension(),
                height: dimension(),
                crop: vine.boolean().optional(),
            })
            .optional(),
        medium: vine
            .object({
                width: dimension(),
                height: dimension(),
            })
            .optional(),
        large: vine
            .object({
                width: dimension(),
                height: dimension(),
            })
            .optional(),
        uploads: vine
            .object({
                organize_by_date: vine.boolean().optional(),
                max_upload_mb: vine.number().withoutDecimals().min(1).max(100).optional(),
            })
            .optional(),
    }),
);
