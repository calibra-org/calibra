"use client";

import type { ReactNode } from "react";

import { type DateTimeConfig, setActiveDateTimeConfig } from "#/lib/format";
import { useDateTimeSettings } from "#/lib/queries/datetime-settings";

/**
 * App-wide date/time-format config. Seeded from a server fetch (`config`) for the first paint, then
 * kept live by the shared Date & Time-settings query — so when an operator saves a new format, the
 * mutation updates that query and **every** date across the admin re-renders without a reload.
 * Points the pure `formatDate` / `formatDateTime` singleton at the resolved config.
 */
export function DateTimeFormatProvider({ config, children }: { config: DateTimeConfig; children: ReactNode }) {
    const { data } = useDateTimeSettings();
    const resolved: DateTimeConfig = data ? { dateFormat: data.date_format, timeFormat: data.time_format } : config;
    setActiveDateTimeConfig(resolved);
    return <>{children}</>;
}
