import vine from "@vinejs/vine";

/**
 * Conservative allowlist for a date-fns format pattern. Permits only the tokens the presets and a
 * sane custom pattern use (`y M d E H h m s a Q`) plus literal separators (space, slash, dash,
 * colon, dot, Latin + Persian comma, parens, quote) and digits. This rejects the date-fns
 * throw-tokens (`Y`, `D`, `T`, `P`, `X`, timezone letters) without pulling `date-fns` into the API
 * just to attempt a format — the frontend formatter still wraps `format()` in try/catch as a second
 * line of defence. Length is capped at 32 (no real format needs more).
 */
const FORMAT_PATTERN = /^[yMdEHhmsaQ0-9 /:.,،()'-]{1,32}$/;

/**
 * PATCH body for `PATCH /api/v1/admin/settings/datetime`. Both fields optional — the controller
 * writes only what changed (same-value writes are no-ops). The patterns are date-fns format strings
 * rendered per active calendar (Jalali for `fa`, Gregorian for `en`) on the frontend.
 */
export const adminDateTimeSettingsUpdateValidator = vine.compile(
    vine.object({
        date_format: vine.string().trim().regex(FORMAT_PATTERN).optional(),
        time_format: vine.string().trim().regex(FORMAT_PATTERN).optional(),
    }),
);
