import { z } from "zod";

import type { AdminMediaSettings, AdminMediaSettingsUpdate } from "#/lib/queries/media-settings";

const dimension = z.number().int().min(1).max(4096);

export const mediaFormSchema = z.object({
    thumbnailWidth: dimension,
    thumbnailHeight: dimension,
    thumbnailCrop: z.boolean(),
    mediumWidth: dimension,
    mediumHeight: dimension,
    largeWidth: dimension,
    largeHeight: dimension,
    organizeByDate: z.boolean(),
    maxUploadMb: z.number().int().min(1).max(100),
});

export type MediaForm = z.infer<typeof mediaFormSchema>;

/** Map the API response into the flat form shape. */
export function toForm(settings: AdminMediaSettings): MediaForm {
    return {
        thumbnailWidth: settings.thumbnail.width,
        thumbnailHeight: settings.thumbnail.height,
        thumbnailCrop: settings.thumbnail.crop,
        mediumWidth: settings.medium.width,
        mediumHeight: settings.medium.height,
        largeWidth: settings.large.width,
        largeHeight: settings.large.height,
        organizeByDate: settings.uploads.organize_by_date,
        maxUploadMb: settings.uploads.max_upload_mb,
    };
}

/** Map the form back to the PATCH payload (server no-ops unchanged keys). */
export function toUpdate(values: MediaForm): AdminMediaSettingsUpdate {
    return {
        thumbnail: { width: values.thumbnailWidth, height: values.thumbnailHeight, crop: values.thumbnailCrop },
        medium: { width: values.mediumWidth, height: values.mediumHeight },
        large: { width: values.largeWidth, height: values.largeHeight },
        uploads: { organize_by_date: values.organizeByDate, max_upload_mb: values.maxUploadMb },
    };
}
