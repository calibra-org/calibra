"use client";

import type { AdminSchemas } from "@calibra/sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate } from "#/lib/queries/api-client";

export type AdminGeneralSettings = AdminSchemas["schemas"]["AdminGeneralSettings"];
export type AdminGeneralSettingsUpdate = AdminSchemas["schemas"]["AdminGeneralSettingsUpdate"];

const KEY = (locale: string) => ["admin", "settings", "general", { locale }] as const;

/** Reads the General-tab settings + option lists through the same-origin admin proxy. */
export function useGeneralSettings() {
    const locale = useLocale();
    return useQuery({
        queryKey: KEY(locale),
        queryFn: ({ signal }) => apiGet<{ data: AdminGeneralSettings }>("settings/general", { locale, signal }),
        select: (res) => res.data,
        /** Drives the app-wide money config; refetch is unnecessary until a save updates the cache. */
        staleTime: 5 * 60 * 1000,
    });
}

/** Saves a partial General-tab update; refreshes the cached settings on success. */
export function useUpdateGeneralSettings() {
    const locale = useLocale();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (body: AdminGeneralSettingsUpdate) =>
            apiMutate<{ data: AdminGeneralSettings }>("PATCH", "settings/general", { locale, body }),
        onSuccess: (res) => {
            qc.setQueryData(KEY(locale), res);
        },
    });
}
