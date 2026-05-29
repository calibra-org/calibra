"use client";

import type { Locale } from "@calibra/shared/i18n";
import { FolderPlus, MoreHorizontal, Save, Trash2, Wand2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ChangeEvent, useEffect, useMemo, useState } from "react";

import { MediaFieldPreview, type MediaFieldValue } from "#/components/media-picker";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "#/components/ui/dropdown-menu";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { formatNumber } from "#/lib/format";
import type { AdminCategory, LocalizedString } from "#/lib/types";

import { type InspectorVariant, inspectorFormClassName } from "../_taxonomy-shared/inspector-surface";
import { SlugInput } from "../_taxonomy-shared/slug-input";
import { slugify } from "../_taxonomy-shared/slugify";

import { collectSubtreeIds } from "./build-tree";
import { ParentPicker } from "./parent-picker";

/**
 * Loose category shape consumable by the inspector. The view binds against {@link AdminCategory}
 * plus a `description` field the API doesn't surface yet — declaring the loose type lets us add
 * the field locally and remove the union once the backend catches up.
 *
 * TODO(api): when `description` lands on the AdminCategory schema, fold it into the canonical
 * type and drop this alias.
 */
export interface AdminCategoryLike extends AdminCategory {
    description?: LocalizedString;
}

interface CategoryInspectorProps {
    rows: AdminCategoryLike[];
    selected: AdminCategoryLike | null;
    draft: AdminCategoryLike | null;
    locale: Locale;
    onDraftChange: (draft: AdminCategoryLike | null) => void;
    onCreateNew: (parentId: number | null) => void;
    onSave: (draft: AdminCategoryLike) => void;
    onDelete: (id: number) => void;
    onClose: () => void;
    /** Outer surface — `card` (default) for the management aside, `plain` inside the detail sheet. */
    variant?: InspectorVariant;
}

/**
 * Right-hand inspector pane. Edits the currently-selected category; doubles as the "create new"
 * form when `draft.id` is negative (we use a sentinel id so the picker can still exclude the
 * row from the parent dropdown even before the server assigns a real one).
 */
export function CategoryInspector({
    rows,
    selected,
    draft,
    locale,
    onDraftChange,
    onCreateNew,
    onSave,
    onDelete,
    onClose,
    variant,
}: CategoryInspectorProps) {
    const t = useTranslations("Categories.inspector");

    if (draft === null) {
        return <InspectorEmpty onCreate={() => onCreateNew(null)} />;
    }

    return (
        <InspectorForm
            t={t}
            rows={rows}
            selected={selected}
            draft={draft}
            locale={locale}
            onDraftChange={onDraftChange}
            onSave={onSave}
            onDelete={onDelete}
            onClose={onClose}
            onCreateNew={onCreateNew}
            variant={variant}
        />
    );
}

interface InspectorEmptyProps {
    onCreate: () => void;
}

function InspectorEmpty({ onCreate }: InspectorEmptyProps) {
    const t = useTranslations("Categories.inspector.empty");
    return (
        <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed bg-card/40 p-8 text-center">
            <div className="grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
                <FolderPlus className="size-6" aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-1">
                <h2 className="font-semibold text-foreground text-lg">{t("title")}</h2>
                <p className="max-w-sm text-muted-foreground text-sm">{t("subtitle")}</p>
            </div>
            <Button onClick={onCreate}>
                <FolderPlus className="size-4" aria-hidden="true" />
                {t("cta")}
            </Button>
            <ul className="mt-4 flex flex-col gap-2 text-muted-foreground text-xs">
                <li>{t("tip1")}</li>
                <li>{t("tip2")}</li>
                <li>{t("tip3")}</li>
            </ul>
        </div>
    );
}

interface InspectorFormProps {
    t: ReturnType<typeof useTranslations<"Categories.inspector">>;
    rows: AdminCategoryLike[];
    selected: AdminCategoryLike | null;
    draft: AdminCategoryLike;
    locale: Locale;
    onDraftChange: (draft: AdminCategoryLike) => void;
    onSave: (draft: AdminCategoryLike) => void;
    onDelete: (id: number) => void;
    onClose: () => void;
    onCreateNew: (parentId: number | null) => void;
    variant?: InspectorVariant;
}

function InspectorForm({
    t,
    rows,
    selected,
    draft,
    locale,
    onDraftChange,
    onSave,
    onDelete,
    onClose,
    onCreateNew,
    variant,
}: InspectorFormProps) {
    const isNew = draft.id < 0;

    /** Auto-slug as the user types into name until they touch the slug field manually. */
    const [slugTouched, setSlugTouched] = useState(false);
    useEffect(() => {
        if (slugTouched) return;
        const next = slugify(draft.name[locale] ?? "");
        if ((draft.slug[locale] ?? "") === next) return;
        onDraftChange({
            ...draft,
            slug: { ...draft.slug, [locale]: next },
        });
    }, [draft, locale, onDraftChange, slugTouched]);

    /** Descendant set of the row being edited — fed to {@link ParentPicker} to prevent cycles. */
    const excludeDescendants = useMemo(() => {
        if (isNew || draft.id < 0) return new Set<number>();
        return collectSubtreeIds(rows, draft.id);
    }, [rows, draft.id, isNew]);

    const updateLocalized = (field: "name" | "slug" | "description", value: string, l: Locale) => {
        const current = (draft[field] ?? { fa: "", en: "" }) as LocalizedString;
        onDraftChange({
            ...draft,
            [field]: { ...current, [l]: value },
        });
    };

    const handleNameChange = (event: ChangeEvent<HTMLInputElement>) => updateLocalized("name", event.target.value, locale);
    const handleSlugChange = (event: ChangeEvent<HTMLInputElement>) => {
        setSlugTouched(true);
        updateLocalized("slug", event.target.value, locale);
    };
    const handleDescriptionChange = (event: ChangeEvent<HTMLTextAreaElement>) =>
        updateLocalized("description", event.target.value, locale);

    const childrenCount = useMemo(
        () => rows.filter((row) => row.parentId === draft.id && draft.id >= 0).length,
        [rows, draft.id],
    );

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                onSave(draft);
            }}
            className={inspectorFormClassName(variant)}
        >
            <header className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <Badge variant={isNew ? "default" : "secondary"} className="font-medium uppercase tracking-wide">
                            {isNew ? t("badgeNew") : t("badgeEdit")}
                        </Badge>
                        {!isNew && selected !== null && (
                            <span className="text-muted-foreground text-xs">
                                {t("inspecting", { name: selected.name[locale] || t("untitled") })}
                            </span>
                        )}
                    </div>
                    <h2 className="truncate font-semibold text-foreground text-lg">
                        {draft.name[locale] || t("untitledHeader")}
                    </h2>
                </div>
                <div className="flex items-center gap-1">
                    {variant === "plain" ? (
                        /**
                         * In the detail sheet "add subcategory" / "create sibling" don't apply (you
                         * opened one term to edit it), so collapse the overflow menu to a direct
                         * delete button — matching the brand / tag inspectors.
                         */
                        !isNew && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={t("menu.delete")}
                                onClick={() => onDelete(draft.id)}
                                className="size-8 text-muted-foreground hover:text-destructive"
                            >
                                <Trash2 className="size-4" aria-hidden="true" />
                            </Button>
                        )
                    ) : (
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                render={(props) => (
                                    <Button {...props} type="button" variant="ghost" size="icon" className="size-8">
                                        <MoreHorizontal className="size-4" aria-hidden="true" />
                                    </Button>
                                )}
                            />
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => onCreateNew(isNew ? null : draft.id)}>
                                    <FolderPlus className="size-3.5" aria-hidden="true" />
                                    {isNew ? t("menu.createSibling") : t("menu.createChild")}
                                </DropdownMenuItem>
                                {!isNew && (
                                    <DropdownMenuItem onClick={() => onDelete(draft.id)} className="text-destructive">
                                        <Trash2 className="size-3.5" aria-hidden="true" />
                                        {t("menu.delete")}
                                    </DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t("close")}
                        onClick={onClose}
                        className="size-8"
                    >
                        <X className="size-4" aria-hidden="true" />
                    </Button>
                </div>
            </header>

            <CoverField
                value={
                    draft.imageMediaId !== null && draft.imageUrl !== null
                        ? { id: draft.imageMediaId, url: draft.imageUrl }
                        : null
                }
                onChange={(next) => onDraftChange({ ...draft, imageMediaId: next?.id ?? null, imageUrl: next?.url ?? null })}
            />

            <div className="grid gap-4">
                <div className="grid gap-2">
                    <Label htmlFor="cat-name">{t("fields.name.label")}</Label>
                    <Input
                        id="cat-name"
                        value={draft.name[locale] ?? ""}
                        onChange={handleNameChange}
                        placeholder={t("fields.name.placeholder")}
                        autoComplete="off"
                    />
                </div>

                <div className="grid gap-2">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="cat-slug">{t("fields.slug.label")}</Label>
                        {slugTouched && (
                            <button
                                type="button"
                                onClick={() => {
                                    setSlugTouched(false);
                                    updateLocalized("slug", slugify(draft.name[locale] ?? ""), locale);
                                }}
                                className="inline-flex items-center gap-1 text-primary text-xs hover:underline"
                            >
                                <Wand2 className="size-3" aria-hidden="true" />
                                {t("fields.slug.regenerate")}
                            </button>
                        )}
                    </div>
                    <SlugInput
                        id="cat-slug"
                        value={draft.slug[locale] ?? ""}
                        onChange={handleSlugChange}
                        placeholder={t("fields.slug.placeholder")}
                    />
                    <p className="text-muted-foreground text-xs">{t("fields.slug.hint")}</p>
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="cat-parent">{t("fields.parent.label")}</Label>
                    <ParentPicker
                        rows={rows}
                        excludeId={isNew ? null : draft.id}
                        excludeDescendants={excludeDescendants}
                        value={draft.parentId}
                        onChange={(parentId) => onDraftChange({ ...draft, parentId })}
                        locale={locale}
                    />
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="cat-description">{t("fields.description.label")}</Label>
                    <Textarea
                        id="cat-description"
                        value={draft.description?.[locale] ?? ""}
                        onChange={handleDescriptionChange}
                        placeholder={t("fields.description.placeholder")}
                        rows={3}
                    />
                    <p className="text-muted-foreground text-xs">
                        {/* TODO(api): description isn't persisted yet — wire to /admin/categories/{id} once the field lands. */}
                        {t("fields.description.todo")}
                    </p>
                </div>

                {!isNew && (
                    <div className="grid grid-cols-3 gap-2 rounded-lg border border-border/40 bg-muted/30 p-3 text-xs">
                        <Stat label={t("stats.products")} value={formatNumber(draft.productCount, locale)} />
                        <Stat label={t("stats.children")} value={formatNumber(childrenCount, locale)} />
                        <Stat label={t("stats.depth")} value={formatNumber(depthOf(rows, draft.id), locale)} />
                    </div>
                )}
            </div>

            <footer className="mt-auto flex flex-col gap-3 pt-2">
                <div className="text-muted-foreground text-xs">{isNew ? t("footer.newHint") : t("footer.editHint")}</div>
                <div className="flex items-center justify-end gap-2">
                    <Button type="button" variant="outline" onClick={onClose}>
                        {t("buttons.cancel")}
                    </Button>
                    <Button type="submit" disabled={draft.name[locale]?.trim().length === 0}>
                        <Save className="size-4" aria-hidden="true" />
                        {isNew ? t("buttons.create") : t("buttons.save")}
                    </Button>
                </div>
            </footer>
        </form>
    );
}

interface CoverFieldProps {
    value: MediaFieldValue | null;
    onChange: (next: MediaFieldValue | null) => void;
}

/** Thin wrapper that maps the category-specific label onto the shared media field. */
function CoverField({ value, onChange }: CoverFieldProps) {
    const t = useTranslations("Categories.inspector.cover");
    return <MediaFieldPreview label={t("label")} value={value} onChange={onChange} />;
}

interface StatProps {
    label: string;
    value: string;
}

function Stat({ label, value }: StatProps) {
    return (
        <div className="flex flex-col">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium text-foreground text-sm tabular-nums">{value}</span>
        </div>
    );
}

/** Depth (0 = top level) of `id` inside the flat rows. Used by the inspector stats block. */
function depthOf(rows: AdminCategoryLike[], id: number): number {
    let depth = 0;
    let current = rows.find((row) => row.id === id);
    while (current?.parentId !== null && current !== undefined) {
        depth += 1;
        const parentId = current.parentId;
        current = rows.find((row) => row.id === parentId);
        if (depth > 64) break;
    }
    return depth;
}
