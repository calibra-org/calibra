"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale, useTranslations } from "next-intl";
import { useCallback } from "react";

import { EntityPicker, type EntityOption } from "#/components/shared/entity-picker";
import { apiGet } from "#/lib/queries/api-client";

interface BrandPickerProps {
    selectedIds: number[];
    onSelectionChange: (next: number[]) => void;
    placeholder: string;
}

interface BrandListItem {
    id: number;
    name: string | Record<string, string>;
    slug?: string | null;
    translations?: { locale: string; name?: string | null }[];
}

interface BrandListEnvelope {
    data: BrandListItem[];
}

function labelFor(brand: BrandListItem, locale: Locale): string {
    if (typeof brand.name === "string") return brand.name;
    if (brand.name !== undefined && brand.name !== null && typeof brand.name === "object") {
        const map = brand.name as Record<string, string>;
        return map[locale] ?? map.fa ?? map.en ?? `#${brand.id}`;
    }
    const fromTranslations = (brand.translations ?? []).find((t) => t.locale === locale)?.name;
    if (fromTranslations) return fromTranslations;
    return `#${brand.id}`;
}

/** Async brand picker — same shape as the product / category variants for predictable use. */
export function BrandPicker({ selectedIds, onSelectionChange, placeholder }: BrandPickerProps) {
    const locale = useLocale() as Locale;
    const t = useTranslations("Coupons.editor.pickers");

    const onSearch = useCallback(
        async (query: string): Promise<EntityOption[]> => {
            const payload = await apiGet<BrandListEnvelope>("brands", {
                locale,
                query: { q: query, perPage: 50 },
            });
            return (payload.data ?? []).map((row) => ({
                id: row.id,
                label: labelFor(row, locale),
                sublabel: row.slug ?? undefined,
            }));
        },
        [locale],
    );

    const onResolve = useCallback(
        async (ids: number[]): Promise<EntityOption[]> => {
            if (ids.length === 0) return [];
            const payload = await apiGet<BrandListEnvelope>("brands", {
                locale,
                query: { ids: ids.join(","), perPage: ids.length },
            });
            return (payload.data ?? []).map((row) => ({
                id: row.id,
                label: labelFor(row, locale),
                sublabel: row.slug ?? undefined,
            }));
        },
        [locale],
    );

    return (
        <EntityPicker
            selectedIds={selectedIds}
            onSelectionChange={onSelectionChange}
            onSearch={onSearch}
            onResolve={onResolve}
            placeholder={placeholder}
            labels={{
                search: t("searchBrands"),
                empty: t("noResults"),
                loading: t("loading"),
                clearAll: t("clearAll"),
                remove: t("remove"),
            }}
        />
    );
}
