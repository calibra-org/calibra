import vine from "@vinejs/vine";

/**
 * PATCH body for `/api/v1/admin/media/{id}`. Every field is optional so callers can ship the
 * single changed value (e.g. the alt-text auto-save on blur). Lengths match the column widths
 * in the migration; longer-form fields (`caption`, `description`) are `TEXT` so we cap them at
 * a generous-but-finite ceiling rather than the DB max to keep payloads small.
 */
export const updateMediaValidator = vine.compile(
    vine.object({
        title: vine.string().trim().maxLength(512).nullable().optional(),
        alt: vine.string().trim().maxLength(512).nullable().optional(),
        caption: vine.string().trim().maxLength(2000).nullable().optional(),
        description: vine.string().trim().maxLength(4000).nullable().optional(),
        filename: vine.string().trim().maxLength(512).optional(),
    }),
);
