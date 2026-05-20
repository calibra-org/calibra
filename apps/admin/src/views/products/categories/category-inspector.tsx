"use client";

import type { Locale } from "@calibra/shared/i18n";
import { FolderPlus, ImagePlus, Languages, MoreHorizontal, Save, Trash2, Wand2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ChangeEvent, useEffect, useMemo, useState } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "#/components/ui/dropdown-menu";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { formatNumber } from "#/lib/format";
import type { AdminCategory, LocalizedString } from "#/lib/types";
import { cn } from "#/lib/utils";

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
}

const OTHER_LOCALE: Record<Locale, Locale> = { fa: "en", en: "fa" };

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
}: InspectorFormProps) {
    const [showOtherLocale, setShowOtherLocale] = useState(false);
    const isNew = draft.id < 0;
    const otherLocale = OTHER_LOCALE[locale];

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
            className="flex h-full flex-col gap-5 rounded-2xl border border-border/60 bg-card p-5 shadow-sm"
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
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t("toggleOtherLocale", { locale: otherLocale.toUpperCase() })}
                        onClick={() => setShowOtherLocale((current) => !current)}
                        className={cn("size-8 text-muted-foreground", showOtherLocale && "text-primary")}
                    >
                        <Languages className="size-4" aria-hidden="true" />
                    </Button>
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

            <CoverField imageUrl={draft.imageUrl} onChange={(url) => onDraftChange({ ...draft, imageUrl: url })} />

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
                    {showOtherLocale && (
                        <Input
                            value={draft.name[otherLocale] ?? ""}
                            onChange={(event) => updateLocalized("name", event.target.value, otherLocale)}
                            placeholder={t("fields.name.otherPlaceholder", { locale: otherLocale.toUpperCase() })}
                            dir={otherLocale === "fa" ? "rtl" : "ltr"}
                            autoComplete="off"
                            className="text-muted-foreground"
                        />
                    )}
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
                    <Input
                        id="cat-slug"
                        value={draft.slug[locale] ?? ""}
                        onChange={handleSlugChange}
                        placeholder={t("fields.slug.placeholder")}
                        dir="ltr"
                        autoComplete="off"
                        className="font-mono"
                    />
                    {showOtherLocale && (
                        <Input
                            value={draft.slug[otherLocale] ?? ""}
                            onChange={(event) => updateLocalized("slug", event.target.value, otherLocale)}
                            placeholder={t("fields.slug.placeholder")}
                            dir="ltr"
                            autoComplete="off"
                            className="font-mono text-muted-foreground"
                        />
                    )}
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
                    {showOtherLocale && (
                        <Textarea
                            value={draft.description?.[otherLocale] ?? ""}
                            onChange={(event) => updateLocalized("description", event.target.value, otherLocale)}
                            placeholder={t("fields.description.otherPlaceholder", { locale: otherLocale.toUpperCase() })}
                            dir={otherLocale === "fa" ? "rtl" : "ltr"}
                            rows={3}
                            className="text-muted-foreground"
                        />
                    )}
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

            <footer className="mt-auto flex items-center justify-between gap-2 pt-2">
                <div className="text-muted-foreground text-xs">{isNew ? t("footer.newHint") : t("footer.editHint")}</div>
                <div className="flex items-center gap-2">
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
    imageUrl: string | null;
    onChange: (url: string | null) => void;
}

function CoverField({ imageUrl, onChange }: CoverFieldProps) {
    const t = useTranslations("Categories.inspector.cover");

    return (
        <div className="grid gap-2">
            <Label>{t("label")}</Label>
            <div className="relative flex h-32 items-center justify-center overflow-hidden rounded-xl border border-border/60 border-dashed bg-muted/30 transition-colors hover:border-primary/40 hover:bg-muted/50">
                {imageUrl === null || imageUrl.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <ImagePlus className="size-5" aria-hidden="true" />
                        <span className="text-xs">{t("placeholder")}</span>
                        {/* TODO(api): wire an upload endpoint; for now the field is read-only. */}
                        <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">{t("todo")}</span>
                    </div>
                ) : (
                    <>
                        {/* biome-ignore lint/performance/noImgElement: cover preview, no Next/Image loader configured */}
                        <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => onChange(null)}
                            className="absolute end-2 top-2 h-7 gap-1 bg-background/80 px-2 text-xs backdrop-blur"
                        >
                            <X className="size-3" aria-hidden="true" />
                            {t("remove")}
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
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

/**
 * Hand-rolled slug-ifier. Latin and Persian go through `String#normalize` to fold diacritics,
 * then anything that isn't a letter / digit / dash becomes a dash, with run collapsing and
 * trim. We deliberately do not transliterate Persian to Latin — categories often live under
 * Persian slugs in the storefront URL and that's the user's preference, not ours.
 */
function slugify(value: string): string {
    return value
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, "-")
        .replace(/[^a-z0-9؀-ۿ-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
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
