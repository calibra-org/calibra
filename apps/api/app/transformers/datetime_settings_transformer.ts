/**
 * Date & Time settings transformer. Projects the `datetime` settings group into the typed shape the
 * admin Date & Time tab consumes, and ships the fixed preset lists so the frontend renders the radio
 * options without hardcoding patterns. Patterns are date-fns format strings; `label_key` is the leaf
 * i18n key under `Settings.datetime.preset.*` the frontend resolves per locale.
 */

export interface FormatPreset {
    pattern: string;
    label_key: string;
}

/** Date-format presets offered in the Date & Time tab (mirrors the WP date-structure choices). */
export const DATE_PRESETS: readonly FormatPreset[] = [
    { pattern: "d MMMM yyyy", label_key: "dMonthY" },
    { pattern: "MMMM d، yyyy", label_key: "monthDY" },
    { pattern: "yyyy/MM/dd", label_key: "ymdSlash" },
    { pattern: "yyyy-MM-dd", label_key: "ymdDash" },
    { pattern: "dd/MM/yyyy", label_key: "dmy" },
] as const;

/** Time-format presets offered in the Date & Time tab (mirrors the WP time-structure choices). */
export const TIME_PRESETS: readonly FormatPreset[] = [
    { pattern: "HH:mm", label_key: "h24" },
    { pattern: "h:mm a", label_key: "h12" },
    { pattern: "HH:mm:ss", label_key: "h24s" },
] as const;

/** Defaults mirror the seeded `datetime` group so an empty store still renders sane formats. */
const DEFAULT_DATE_FORMAT = "d MMMM yyyy";
const DEFAULT_TIME_FORMAT = "HH:mm";

/** Assemble the admin `GET /api/v1/admin/settings/datetime` response from the `datetime` group. */
export function toDateTimeSettings(datetime: Record<string, unknown>) {
    const str = (key: string, fallback: string): string =>
        typeof datetime[key] === "string" && datetime[key] !== "" ? (datetime[key] as string) : fallback;

    return {
        date_format: str("date_format", DEFAULT_DATE_FORMAT),
        time_format: str("time_format", DEFAULT_TIME_FORMAT),
        presets: {
            date: DATE_PRESETS.map((p) => ({ pattern: p.pattern, label_key: p.label_key })),
            time: TIME_PRESETS.map((p) => ({ pattern: p.pattern, label_key: p.label_key })),
        },
    };
}
