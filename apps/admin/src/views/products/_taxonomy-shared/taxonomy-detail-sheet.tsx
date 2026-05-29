"use client";

import type { AdminSchemas } from "@calibra/sdk";
import type { Locale } from "@calibra/shared/i18n";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useEffect, useState } from "react";

import { SheetBody, SheetContent, SheetRoot, SheetTitle } from "#/components/ui/sheet";
import type { LocalizedString, TaxonomyKind } from "#/lib/types";

import { type AdminBrandDraft, BrandInspector } from "../brands/brand-inspector";
import { useDeleteBrand, useUpdateBrand } from "../brands/queries";
import { type AdminCategoryLike, CategoryInspector } from "../categories/category-inspector";
import { useCategoriesList, useDeleteCategory, useUpdateCategory } from "../categories/queries";
import { useDeleteTag, useUpdateTag } from "../tags/queries";
import { type AdminTagDraft, TagInspector } from "../tags/tag-inspector";

import { useTaxonomyTerm } from "./use-taxonomy-term";

type SdkAdminTaxonomy = AdminSchemas["schemas"]["AdminTaxonomy"];

/** A taxonomy term the operator clicked in a product row, identifying what to load + edit. */
export interface TaxonomyTarget {
    kind: TaxonomyKind;
    id: number;
}

function dup(value: string | null | undefined): LocalizedString {
    const safe = typeof value === "string" ? value : "";
    return { fa: safe, en: safe };
}

/** The `show` payload carries description on the active-locale translation row, not at the top level. */
function descriptionOf(term: SdkAdminTaxonomy, locale: Locale): string {
    const rows = term.translations ?? [];
    const match = rows.find((row) => row.locale === locale) ?? rows[0];
    return match?.description ?? "";
}

/**
 * The single reusable editable detail surface for every product taxonomy. Opened from a chip in
 * the products datagrid, it slides in an aside sheet, fetches the clicked term, and hosts the
 * SAME inspector form the dedicated taxonomy management page uses — so editing a brand/category/
 * tag is identical everywhere and there's one code path to maintain. Per-kind wiring lives in the
 * three thin body components below; the shell (sheet chrome + a11y title) is shared.
 */
export function TaxonomyDetailSheet({ target, onClose }: { target: TaxonomyTarget | null; onClose: () => void }) {
    const t = useTranslations("Products.list");
    const open = target !== null;
    const a11yTitle = target === null ? "" : t(`taxonomySheet.${target.kind}` as never);
    return (
        <SheetRoot
            open={open}
            onOpenChange={(next) => {
                if (!next) onClose();
            }}
        >
            <SheetContent side="end" hideCloseButton className="w-full max-w-md">
                <SheetTitle className="sr-only">{a11yTitle}</SheetTitle>
                {target?.kind === "brand" && <BrandSheetBody key={target.id} id={target.id} onClose={onClose} />}
                {target?.kind === "tag" && <TagSheetBody key={target.id} id={target.id} onClose={onClose} />}
                {target?.kind === "category" && <CategorySheetBody key={target.id} id={target.id} onClose={onClose} />}
            </SheetContent>
        </SheetRoot>
    );
}

interface SheetStateProps {
    isPending: boolean;
    isError: boolean;
    ready: boolean;
    children: ReactNode;
}

/** Shared loading / error / ready gate so every kind renders the same skeleton + error copy. */
function SheetState({ isPending, isError, ready, children }: SheetStateProps) {
    const t = useTranslations("Products.list");
    if (isError) {
        return (
            <SheetBody>
                <p className="text-muted-foreground text-sm">{t("taxonomySheet.loadError")}</p>
            </SheetBody>
        );
    }
    if (isPending || !ready) return <SheetBody isLoading />;
    return <SheetBody>{children}</SheetBody>;
}

function BrandSheetBody({ id, onClose }: { id: number; onClose: () => void }) {
    const locale = useLocale() as Locale;
    const { data: term, isPending, isError } = useTaxonomyTerm("brand", id);
    const update = useUpdateBrand();
    const remove = useDeleteBrand();
    const [draft, setDraft] = useState<AdminBrandDraft | null>(null);

    useEffect(() => {
        if (term === undefined) return;
        setDraft({
            id: term.id,
            name: dup(term.name),
            slug: dup(term.slug),
            productCount: term.used_count ?? 0,
            imageMediaId: term.image_media_id ?? null,
            logoUrl: term.image_url ?? null,
            description: dup(descriptionOf(term, locale)),
        });
    }, [term, locale]);

    const onSave = (next: AdminBrandDraft) =>
        update.mutate(
            {
                id: next.id,
                name: next.name[locale] ?? "",
                slug: next.slug[locale] ?? "",
                description: next.description?.[locale] ?? null,
                imageMediaId: next.imageMediaId,
            },
            { onSuccess: onClose },
        );

    return (
        <SheetState isPending={isPending} isError={isError} ready={draft !== null}>
            <BrandInspector
                variant="plain"
                draft={draft}
                selected={draft}
                locale={locale}
                submitting={update.isPending}
                onDraftChange={setDraft}
                onCreateNew={() => undefined}
                onSave={onSave}
                onDelete={(delId) => remove.mutate({ id: delId }, { onSuccess: onClose })}
                onClose={onClose}
            />
        </SheetState>
    );
}

function TagSheetBody({ id, onClose }: { id: number; onClose: () => void }) {
    const locale = useLocale() as Locale;
    const { data: term, isPending, isError } = useTaxonomyTerm("tag", id);
    const update = useUpdateTag();
    const remove = useDeleteTag();
    const [draft, setDraft] = useState<AdminTagDraft | null>(null);

    useEffect(() => {
        if (term === undefined) return;
        setDraft({
            id: term.id,
            name: dup(term.name),
            slug: dup(term.slug),
            productCount: term.used_count ?? 0,
            description: dup(descriptionOf(term, locale)),
        });
    }, [term, locale]);

    const onSave = (next: AdminTagDraft) =>
        update.mutate(
            {
                id: next.id,
                name: next.name[locale] ?? "",
                slug: next.slug[locale] ?? "",
                description: next.description?.[locale] ?? null,
            },
            { onSuccess: onClose },
        );

    return (
        <SheetState isPending={isPending} isError={isError} ready={draft !== null}>
            <TagInspector
                variant="plain"
                draft={draft}
                selected={draft}
                locale={locale}
                submitting={update.isPending}
                onDraftChange={setDraft}
                onCreateNew={() => undefined}
                onSave={onSave}
                onDelete={(delId) => remove.mutate({ id: delId }, { onSuccess: onClose })}
                onClose={onClose}
            />
        </SheetState>
    );
}

function CategorySheetBody({ id, onClose }: { id: number; onClose: () => void }) {
    const locale = useLocale() as Locale;
    const { data: term, isPending, isError } = useTaxonomyTerm("category", id);
    const list = useCategoriesList({ limit: 200 });
    const update = useUpdateCategory();
    const remove = useDeleteCategory();
    const [draft, setDraft] = useState<AdminCategoryLike | null>(null);

    useEffect(() => {
        if (term === undefined) return;
        setDraft({
            id: term.id,
            parentId: term.parent_id ?? null,
            name: dup(term.name),
            slug: dup(term.slug),
            productCount: term.used_count ?? 0,
            imageMediaId: term.image_media_id ?? null,
            imageUrl: term.image_url ?? null,
            description: dup(descriptionOf(term, locale)),
        });
    }, [term, locale]);

    const onSave = (next: AdminCategoryLike) =>
        update.mutate(
            {
                id: next.id,
                name: next.name[locale] ?? "",
                slug: next.slug[locale] ?? "",
                description: next.description?.[locale] ?? null,
                parentId: next.parentId,
                imageMediaId: next.imageMediaId,
            },
            { onSuccess: onClose },
        );

    return (
        <SheetState isPending={isPending} isError={isError} ready={draft !== null}>
            <CategoryInspector
                variant="plain"
                rows={list.data?.data ?? []}
                selected={draft}
                draft={draft}
                locale={locale}
                onDraftChange={setDraft}
                onCreateNew={() => undefined}
                onSave={onSave}
                onDelete={(delId) => remove.mutate({ id: delId }, { onSuccess: onClose })}
                onClose={onClose}
            />
        </SheetState>
    );
}
