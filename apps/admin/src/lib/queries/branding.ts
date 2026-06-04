"use client";

import type { AdminSchemas } from "@calibra/sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate } from "#/lib/queries/api-client";

export type AdminBrandingSettings = AdminSchemas["schemas"]["AdminBrandingSettings"];
export type AdminBrandingSettingsUpdate = AdminSchemas["schemas"]["AdminBrandingSettingsUpdate"];

const KEY = (locale: string) => ["admin", "settings", "branding", { locale }] as const;

/**
 * Reads the Branding screen's storefront-facing config through the same-origin admin proxy.
 * `initialData` (the SSR server-repo paint) seeds the cache so the form renders without a skeleton.
 */
export function useBranding(initialData?: AdminBrandingSettings) {
    const locale = useLocale();
    return useQuery({
        queryKey: KEY(locale),
        queryFn: ({ signal }) => apiGet<{ data: AdminBrandingSettings }>("settings/branding", { locale, signal }),
        select: (res) => res.data,
        ...(initialData ? { initialData: { data: initialData } } : {}),
        staleTime: 5 * 60 * 1000,
    });
}

/** Saves a partial Branding update; refreshes the cached settings on success. */
export function useUpdateBranding() {
    const locale = useLocale();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (body: AdminBrandingSettingsUpdate) =>
            apiMutate<{ data: AdminBrandingSettings }>("PATCH", "settings/branding", { locale, body }),
        onSuccess: (res) => {
            qc.setQueryData(KEY(locale), res);
        },
    });
}
