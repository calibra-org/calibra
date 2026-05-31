"use client";

import type { AdminSchemas } from "@calibra/sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate } from "#/lib/queries/api-client";

export type AdminDateTimeSettings = AdminSchemas["schemas"]["AdminDateTimeSettings"];
export type AdminDateTimeSettingsUpdate = AdminSchemas["schemas"]["AdminDateTimeSettingsUpdate"];

const KEY = (locale: string) => ["admin", "settings", "datetime", { locale }] as const;

/** Reads the Date & Time-tab formats + preset lists through the same-origin admin proxy. */
export function useDateTimeSettings() {
    const locale = useLocale();
    return useQuery({
        queryKey: KEY(locale),
        queryFn: ({ signal }) => apiGet<{ data: AdminDateTimeSettings }>("settings/datetime", { locale, signal }),
        select: (res) => res.data,
        /** Drives the app-wide date/time config; refetch is unnecessary until a save updates the cache. */
        staleTime: 5 * 60 * 1000,
    });
}

/** Saves a partial Date & Time-tab update; refreshes the cached settings on success. */
export function useUpdateDateTimeSettings() {
    const locale = useLocale();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (body: AdminDateTimeSettingsUpdate) =>
            apiMutate<{ data: AdminDateTimeSettings }>("PATCH", "settings/datetime", { locale, body }),
        onSuccess: (res) => {
            qc.setQueryData(KEY(locale), res);
        },
    });
}
