import { z } from "zod";

import type { AdminDateTimeSettings, AdminDateTimeSettingsUpdate } from "#/lib/queries/datetime-settings";

/**
 * Scenario-specific date-fns token allowlists. A **date** pattern may only use date tokens
 * (`y` year, `M` month, `d` day, `E` weekday, `Q` quarter) + date separators, and must contain at
 * least one date token — so a time pattern like `HH:mm` is rejected in the date field. A **time**
 * pattern may only use time tokens (`H`/`h` hour, `m` minute, `s` second, `a` period) + time
 * separators. Case matters: `M` is month, `m` is minute. Both cap at 32 chars and exclude the
 * date-fns throw-tokens (`Y`, `D`, `T`, timezone letters) by simply not listing them.
 */
export const DATE_FORMAT_RE = /^(?=.*[yMdEQ])[yMdEQ0-9 /.,،'()-]{1,32}$/;
export const TIME_FORMAT_RE = /^(?=.*[Hhmsa])[Hhmsa0-9 :.'()-]{1,32}$/;

export const datetimeFormSchema = z.object({
    dateFormat: z.string().regex(DATE_FORMAT_RE),
    timeFormat: z.string().regex(TIME_FORMAT_RE),
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
