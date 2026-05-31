import "server-only";

import { apiServer } from "#/lib/api";
import type { DateTimeConfig } from "#/lib/format";

/** Toman-era defaults used when the settings call fails — keeps dates rendering rather than blanking. */
const FALLBACK: DateTimeConfig = { dateFormat: "d MMMM yyyy", timeFormat: "HH:mm" };

/**
 * Server-side fetch of the store's date/time format config (admin `GET /settings/datetime`) for the
 * app-wide {@link DateTimeFormatProvider} first paint. Resilient: falls back to the seeded defaults
 * if the call fails so a transient hiccup never blanks every date in the panel.
 */
export async function getDateTimeConfig(): Promise<DateTimeConfig> {
    try {
        const api = await apiServer();
        const { data } = await api.admin.GET("/api/v1/admin/settings/datetime");
        return data ? { dateFormat: data.data.date_format, timeFormat: data.data.time_format } : FALLBACK;
    } catch {
        return FALLBACK;
    }
}
