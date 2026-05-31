import vine from "@vinejs/vine";

/**
 * Scenario-specific date-fns token allowlists, matched to the admin Date & Time form. A **date**
 * pattern may use only date tokens (`y` year, `M` month, `d` day, `E` weekday, `Q` quarter) + date
 * separators and must contain at least one date token; a **time** pattern may use only time tokens
 * (`H`/`h` hour, `m` minute, `s` second, `a` period) + time separators. Case matters (`M` month vs
 * `m` minute). Both cap at 32 chars and exclude the date-fns throw-tokens (`Y`, `D`, `T`, timezone
 * letters) by not listing them — so a time pattern can't land in the date field, and the frontend
 * never renders a nonsensical or throwing pattern. The frontend mirrors these regexes for instant
 * inline validation; this is the authoritative server check.
 */
const DATE_FORMAT_PATTERN = /^(?=.*[yMdEQ])[yMdEQ0-9 /.,،'()-]{1,32}$/;
const TIME_FORMAT_PATTERN = /^(?=.*[Hhmsa])[Hhmsa0-9 :.'()-]{1,32}$/;

/**
 * PATCH body for `PATCH /api/v1/admin/settings/datetime`. Both fields optional — the controller
 * writes only what changed (same-value writes are no-ops). The patterns are date-fns format strings
 * rendered per active calendar (Jalali for `fa`, Gregorian for `en`) on the frontend.
 */
export const adminDateTimeSettingsUpdateValidator = vine.compile(
    vine.object({
        date_format: vine.string().trim().regex(DATE_FORMAT_PATTERN).optional(),
        time_format: vine.string().trim().regex(TIME_FORMAT_PATTERN).optional(),
    }),
);
