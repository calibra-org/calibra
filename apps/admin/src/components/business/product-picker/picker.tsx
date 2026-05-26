"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale, useTranslations } from "next-intl";
import { useCallback } from "react";

import { type EntityOption, EntityPicker } from "#/components/shared/entity-picker";
import { apiGet } from "#/lib/queries/api-client";

interface ProductPickerProps {
    selectedIds: number[];
    onSelectionChange: (next: number[]) => void;
    /** Optional add hook — fires with the full option when one is selected (label, sku, image). */
    onAdd?: (option: EntityOption) => void;
    /** Optional remove hook — fires with the id when one is deselected. */
    onRemove?: (id: number) => void;
    placeholder: string;
    /** Suppress the default chip strip; caller renders its own selection display. */
    hideChips?: boolean;
}

interface ProductListItem {
    id: number;
    name: string | Record<string, string>;
    sku?: string | null;
    featured_image_url?: string | null;
    translations?: { locale: string; name?: string | null }[];
}

interface ProductListEnvelope {
    data: ProductListItem[];
}

function labelFor(product: ProductListItem, locale: Locale): string {
    if (typeof product.name === "string") return product.name;
    if (product.name !== undefined && product.name !== null && typeof product.name === "object") {
        const map = product.name as Record<string, string>;
        return map[locale] ?? map.fa ?? map.en ?? `#${product.id}`;
    }
    const fromTranslations = (product.translations ?? []).find((t) => t.locale === locale)?.name;
    if (fromTranslations) return fromTranslations;
    return `#${product.id}`;
}

/**
 * Async product picker for the coupon editor. Queries `/admin/products` with the user's typed
 * search string; results are deduped against the current selection. `onResolve` is used to fetch
 * chip labels for ids that were never in the search-result list (initial hydration of a saved
 * coupon).
 */
export function ProductPicker({ selectedIds, onSelectionChange, onAdd, onRemove, placeholder, hideChips }: ProductPickerProps) {
    const locale = useLocale() as Locale;
    const t = useTranslations("Coupons.editor.pickers");

    const onSearch = useCallback(
        async (query: string): Promise<EntityOption[]> => {
            const payload = await apiGet<ProductListEnvelope>("products", {
                locale,
                /** The admin products controller filters by `search`, not `q`. Passing `q=` matches
                 * nothing on the server side and silently returns every product unfiltered. */
                query: { search: query, perPage: 20 },
            });
            return (payload.data ?? []).map((row) => ({
                id: row.id,
                label: labelFor(row, locale),
                sublabel: row.sku ?? undefined,
                imageUrl: row.featured_image_url ?? null,
            }));
        },
        [locale],
    );

    const onResolve = useCallback(
        async (ids: number[]): Promise<EntityOption[]> => {
            if (ids.length === 0) return [];
            const payload = await apiGet<ProductListEnvelope>("products", {
                locale,
                query: { ids: ids.join(","), perPage: ids.length },
            });
            return (payload.data ?? []).map((row) => ({
                id: row.id,
                label: labelFor(row, locale),
                sublabel: row.sku ?? undefined,
                imageUrl: row.featured_image_url ?? null,
            }));
        },
        [locale],
    );

    return (
        <EntityPicker
            selectedIds={selectedIds}
            onSelectionChange={onSelectionChange}
            onAdd={onAdd}
            onRemove={onRemove}
            onSearch={onSearch}
            onResolve={onResolve}
            placeholder={placeholder}
            hideChips={hideChips}
            labels={{
                search: t("searchProducts"),
                empty: t("noResults"),
                loading: t("loading"),
                clearAll: t("clearAll"),
                remove: t("remove"),
            }}
        />
    );
}
