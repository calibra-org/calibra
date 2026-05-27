"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale, useTranslations } from "next-intl";
import { useCallback } from "react";

import { type EntityOption, EntityPicker } from "#/components/shared/entity-picker";
import { apiGet } from "#/lib/queries/api-client";

interface CategoryPickerProps {
    selectedIds: number[];
    onSelectionChange: (next: number[]) => void;
    placeholder: string;
}

interface CategoryListItem {
    id: number;
    name: string | Record<string, string>;
    slug?: string | null;
    translations?: { locale: string; name?: string | null }[];
}

interface CategoryListEnvelope {
    data: CategoryListItem[];
}

function labelFor(category: CategoryListItem, locale: Locale): string {
    if (typeof category.name === "string") return category.name;
    if (category.name !== undefined && category.name !== null && typeof category.name === "object") {
        const map = category.name as Record<string, string>;
        return map[locale] ?? map.fa ?? map.en ?? `#${category.id}`;
    }
    const fromTranslations = (category.translations ?? []).find((t) => t.locale === locale)?.name;
    if (fromTranslations) return fromTranslations;
    return `#${category.id}`;
}

/**
 * Async category picker. The taxonomy is small enough that a single GET-all + client-side filter
 * would also work, but going through `q=` keeps it consistent with the product picker and skips
 * sending the whole taxonomy on every render.
 */
export function CategoryPicker({ selectedIds, onSelectionChange, placeholder }: CategoryPickerProps) {
    const locale = useLocale() as Locale;
    const t = useTranslations("Coupons.editor.pickers");

    const onSearch = useCallback(
        async (query: string): Promise<EntityOption[]> => {
            const payload = await apiGet<CategoryListEnvelope>("categories", {
                locale,
                query: { search: query, limit: 50 },
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
            const payload = await apiGet<CategoryListEnvelope>("categories", {
                locale,
                query: { ids: ids.join(","), limit: ids.length },
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
                search: t("searchCategories"),
                empty: t("noResults"),
                loading: t("loading"),
                clearAll: t("clearAll"),
                remove: t("remove"),
            }}
        />
    );
}
