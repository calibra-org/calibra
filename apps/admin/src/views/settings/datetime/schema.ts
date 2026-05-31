import { z } from "zod";

import type { AdminDateTimeSettings, AdminDateTimeSettingsUpdate } from "#/lib/queries/datetime-settings";

/** Conservative date-fns token allowlist — mirrors the server validator so the FE rejects early. */
const FORMAT_PATTERN = /^[yMdEHhmsaQ0-9 /:.,،()'-]{1,32}$/;

export const datetimeFormSchema = z.object({
    dateFormat: z.string().regex(FORMAT_PATTERN),
    timeFormat: z.string().regex(FORMAT_PATTERN),
});

export type DateTimeForm = z.infer<typeof datetimeFormSchema>;

/** Map the API response into the flat form shape. */
export function toForm(settings: AdminDateTimeSettings): DateTimeForm {
    return { dateFormat: settings.date_format, timeFormat: settings.time_format };
}

/** Map the form back to the PATCH payload (server no-ops unchanged keys). */
export function toUpdate(values: DateTimeForm): AdminDateTimeSettingsUpdate {
    return { date_format: values.dateFormat, time_format: values.timeFormat };
}
