"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";
import { useFormContext } from "react-hook-form";

import { ResourcePicker } from "#/components/ui/resource-picker";
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

    const onCreate = useCallback(
        async (name: string) => {
            const created = await createInline.mutateAsync({ name });
            return { id: Number(created.data.id), label: name };
        },
        [createInline],
    );

    const addTag = (id: number) => {
        if (tagIdSet.has(id)) return;
        setValue("tagIds", [...tagIds, id], { shouldDirty: true });
    };

    return (
        <div className="flex flex-col gap-3">
            <ResourcePicker
                multiple
                value={tagIds}
                onChange={(next) => setValue("tagIds", next, { shouldDirty: true })}
                search={search}
                onResolve={resolve}
                creatable={{ onCreate }}
                placeholder={t("addPlaceholder")}
            />

            <div className="flex flex-col gap-1.5">
                <span className="text-muted-foreground text-xs">{t("mostUsedTitle")}</span>
                {mostUsed.isPending ? (
                    <div className="h-6 animate-pulse rounded bg-muted/40" />
                ) : (mostUsed.data ?? []).length === 0 ? (
                    <p className="text-muted-foreground text-xs">{t("mostUsedEmpty")}</p>
                ) : (
                    <div className="flex flex-wrap gap-1">
                        {(mostUsed.data ?? []).map((tag) => (
                            <button
                                key={tag.id}
                                type="button"
                                onClick={() => addTag(tag.id)}
                                disabled={tagIdSet.has(tag.id)}
                                className={cn(
                                    "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs transition-colors",
                                    tagIdSet.has(tag.id)
                                        ? "cursor-default border-primary/30 bg-primary/10 text-primary"
                                        : "border-border bg-background text-foreground/80 hover:border-primary/40 hover:text-foreground",
                                )}
                            >
                                {!tagIdSet.has(tag.id) ? <Plus className="size-3" aria-hidden="true" /> : null}
                                <span>{tag.name[locale] || `#${tag.id}`}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
