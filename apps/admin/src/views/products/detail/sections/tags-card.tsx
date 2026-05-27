"use client";

import type { Locale } from "@calibra/shared/i18n";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import { useFormContext } from "react-hook-form";

import { ResourcePicker } from "#/components/ui/resource-picker";
import { formatNumber } from "#/lib/format";
import { useCreateTagInline } from "#/lib/products/mutations";
import { resolveTags, searchTags, useMostUsedTags } from "#/lib/products/queries";
import { cn } from "#/lib/utils";

import type { ProductDetailFormValues } from "../schema";

/**
 * Sidebar Tags card. Mounts the multi-creatable {@link ResourcePicker} for the operator's
 * primary action and a clickable "Most used" cloud below to surface popular tags from the
 * server-side cache. Clicking a most-used chip adds it to the selection (no-op when already
 * picked).
 */
export function TagsBody() {
    const t = useTranslations("Products.detail.tags");
    const locale = useLocale() as Locale;
    const { watch, setValue } = useFormContext<ProductDetailFormValues>();
    const mostUsed = useMostUsedTags(10);
    const createInline = useCreateTagInline();

    const tagIds = watch("tagIds");
    const tagIdSet = useMemo(() => new Set(tagIds), [tagIds]);

    const search = useCallback((query: string) => searchTags(query, locale), [locale]);
    const resolve = useCallback((ids: (number | string)[]) => resolveTags(ids, locale), [locale]);

    /**
     * `mutateAsync` is stable across renders (TanStack Query memoises it on the mutation
     * result), so depending on it rather than the whole mutation object keeps `onCreate`
     * reference-stable — which keeps the `creatable={{ onCreate }}` object identity behaving
     * as if it were memoised too once we wrap it below.
     */
    const createInlineAsync = createInline.mutateAsync;
    const onCreate = useCallback(
        async (name: string) => {
            const created = await createInlineAsync({ name });
            return { id: Number(created.data.id), label: name };
        },
        [createInlineAsync],
    );
    const creatable = useMemo(() => ({ onCreate }), [onCreate]);
    const onPickerChange = useCallback((next: number[]) => setValue("tagIds", next, { shouldDirty: true }), [setValue]);

    const addTag = (id: number) => {
        if (tagIdSet.has(id)) return;
        setValue("tagIds", [...tagIds, id], { shouldDirty: true });
    };

    const [mostUsedOpen, setMostUsedOpen] = useState(false);
    const mostUsedTags = mostUsed.data ?? [];

    return (
        <div className="flex flex-col gap-3">
            <ResourcePicker
                multiple
                value={tagIds}
                onChange={onPickerChange}
                search={search}
                onResolve={resolve}
                creatable={creatable}
                placeholder={t("addPlaceholder")}
            />

            <div className="flex flex-col gap-1.5">
                <button
                    type="button"
                    onClick={() => setMostUsedOpen((prev) => !prev)}
                    aria-expanded={mostUsedOpen}
                    className="flex w-full items-center gap-1 text-muted-foreground text-xs transition-colors hover:text-foreground"
                >
                    {mostUsedOpen ? (
                        <ChevronDown className="size-3" aria-hidden="true" />
                    ) : (
                        <ChevronRight className="size-3" data-rtl-flip aria-hidden="true" />
                    )}
                    <span>{t("mostUsedTitle")}</span>
                </button>
                {mostUsedOpen ? (
                    mostUsed.isPending ? (
                        <div className="h-6 animate-pulse rounded bg-muted/40" />
                    ) : mostUsedTags.length === 0 ? (
                        <p className="text-muted-foreground text-xs">{t("mostUsedEmpty")}</p>
                    ) : (
                        <div className="flex flex-wrap gap-1">
                            {mostUsedTags.map((tag) => {
                                const picked = tagIdSet.has(tag.id);
                                return (
                                    <button
                                        key={tag.id}
                                        type="button"
                                        onClick={() => addTag(tag.id)}
                                        disabled={picked}
                                        className={cn(
                                            "inline-flex h-6 items-center gap-1 rounded-full border ps-1.5 pe-1 text-xs transition-colors",
                                            picked
                                                ? "cursor-default border-primary/30 bg-primary/10 text-primary"
                                                : "border-border bg-background text-foreground/80 hover:border-primary/40 hover:text-foreground",
                                        )}
                                    >
                                        {!picked ? <Plus className="size-3" aria-hidden="true" /> : null}
                                        <span>{tag.name[locale] || `#${tag.id}`}</span>
                                        <span className="ms-0.5 rounded bg-muted/70 px-1 font-normal text-[10px] text-foreground/60 tabular-nums">
                                            {formatNumber(tag.productCount, locale)}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )
                ) : null}
            </div>
        </div>
    );
}
