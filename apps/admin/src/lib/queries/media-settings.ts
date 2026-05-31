"use client";

import type { AdminSchemas } from "@calibra/sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate } from "#/lib/queries/api-client";

export type AdminMediaSettings = AdminSchemas["schemas"]["AdminMediaSettings"];
export type AdminMediaSettingsUpdate = AdminSchemas["schemas"]["AdminMediaSettingsUpdate"];

const KEY = (locale: string) => ["admin", "settings", "media", { locale }] as const;

/** Reads the Media-tab image-size presets + upload options through the same-origin admin proxy. */
export function useMediaSettings() {
    const locale = useLocale();
    return useQuery({
        queryKey: KEY(locale),
        queryFn: ({ signal }) => apiGet<{ data: AdminMediaSettings }>("settings/media", { locale, signal }),
        select: (res) => res.data,
        staleTime: 5 * 60 * 1000,
    });
}

/** Saves a partial Media-tab update; refreshes the cached settings on success. */
export function useUpdateMediaSettings() {
    const locale = useLocale();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (body: AdminMediaSettingsUpdate) =>
            apiMutate<{ data: AdminMediaSettings }>("PATCH", "settings/media", { locale, body }),
        onSuccess: (res) => {
            qc.setQueryData(KEY(locale), res);
        },
    });
}
