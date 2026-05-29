"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Plus, Save, Sparkles, Tag as TagIcon, Trash2, Wand2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { formatNumber } from "#/lib/format";
import type { AdminTag, LocalizedString } from "#/lib/types";

import { type InspectorVariant, inspectorFormClassName } from "../_taxonomy-shared/inspector-surface";
import { SlugInput } from "../_taxonomy-shared/slug-input";
import { slugify } from "../_taxonomy-shared/slugify";

/**
 * Tag shape the inspector edits. `description` is a local-only field today (mirrors how the
 * category inspector treats it) — the API schema lets us POST/PATCH it via
 * `translations[].description`, but the listing doesn't surface it back, so we keep it on the
 * draft and ship it on save without reading it back into the row.
 */
export interface AdminTagDraft extends AdminTag {
    description?: LocalizedString;
}

interface TagInspectorProps {
    draft: AdminTagDraft | null;
    selected: AdminTagDraft | null;
    locale: Locale;
    submitting: boolean;
    onDraftChange: (draft: AdminTagDraft) => void;
    onCreateNew: () => void;
    onSave: (draft: AdminTagDraft) => void;
    onDelete: (id: number) => void;
    onClose: () => void;
    /** Outer surface — `card` (default) for the management aside, `plain` inside the detail sheet. */
    variant?: InspectorVariant;
}

/**
 * Right-hand pane. Doubles as a permanent "add tag" form when no row is selected — that is
 * how WordPress trains operators to expect this surface, and it keeps the empty state
 * actionable instead of a static placeholder.
 */
export function TagInspector({
    draft,
    selected,
    locale,
    submitting,
    onDraftChange,
    onCreateNew,
    onSave,
    onDelete,
    onClose,
    variant,
}: TagInspectorProps) {
    const t = useTranslations("Tags.inspector");

    if (draft === null) {
        return <InspectorEmpty onCreate={onCreateNew} />;
    }

    /**
     * `key={draft.id}` remounts the form whenever the inspector swaps to a different row, so
     * `slugTouched` and any other inner state resets cleanly instead of leaking across rows.
     */
    return (
        <InspectorForm
            key={draft.id}
            t={t}
            draft={draft}
            selected={selected}
            locale={locale}
            submitting={submitting}
            onDraftChange={onDraftChange}
            onSave={onSave}
            onDelete={onDelete}
            onClose={onClose}
            variant={variant}
        />
    );
}

interface InspectorEmptyProps {
    onCreate: () => void;
}

function InspectorEmpty({ onCreate }: InspectorEmptyProps) {
    const t = useTranslations("Tags.inspector.empty");
    return (
        <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed bg-card/40 p-8 text-center">
            <div className="grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
                <TagIcon className="size-6" aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-1">
                <h2 className="font-semibold text-foreground text-lg">{t("title")}</h2>
                <p className="max-w-sm text-muted-foreground text-sm">{t("subtitle")}</p>
            </div>
            <Button onClick={onCreate}>
                <Plus className="size-4" aria-hidden="true" />
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
    t: ReturnType<typeof useTranslations<"Tags.inspector">>;
    draft: AdminTagDraft;
    selected: AdminTagDraft | null;
    locale: Locale;
    submitting: boolean;
    onDraftChange: (draft: AdminTagDraft) => void;
    onSave: (draft: AdminTagDraft) => void;
    onDelete: (id: number) => void;
    onClose: () => void;
    variant?: InspectorVariant;
}

function InspectorForm({
    t,
    draft,
    selected,
    locale,
    submitting,
    onDraftChange,
    onSave,
    onDelete,
    onClose,
    variant,
}: InspectorFormProps) {
    const [slugTouched, setSlugTouched] = useState(false);
    const isNew = draft.id < 0;

    /**
     * Auto-derive the slug from the name until the user touches the slug field. The parent
     * remounts this form on row change via `key={draft.id}`, so the touched flag starts fresh
     * for every selection.
     */
    useEffect(() => {
        if (slugTouched) return;
        const next = slugify(draft.name[locale] ?? "");
        if ((draft.slug[locale] ?? "") === next) return;
        onDraftChange({ ...draft, slug: { ...draft.slug, [locale]: next } });
    }, [draft, locale, onDraftChange, slugTouched]);

    const updateLocalized = (field: "name" | "slug" | "description", value: string, l: Locale) => {
        const current = (draft[field] ?? { fa: "", en: "" }) as LocalizedString;
        onDraftChange({ ...draft, [field]: { ...current, [l]: value } });
    };

    const handleNameChange = (event: ChangeEvent<HTMLInputElement>) => updateLocalized("name", event.target.value, locale);
    const handleSlugChange = (event: ChangeEvent<HTMLInputElement>) => {
        setSlugTouched(true);
        updateLocalized("slug", event.target.value, locale);
    };
    const handleDescriptionChange = (event: ChangeEvent<HTMLTextAreaElement>) =>
        updateLocalized("description", event.target.value, locale);

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (submitting) return;
        if (draft.name[locale]?.trim().length === 0) return;
        onSave(draft);
    };

    return (
        <form onSubmit={handleSubmit} className={inspectorFormClassName(variant)}>
            <header className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <Badge variant={isNew ? "default" : "secondary"} className="font-medium uppercase tracking-wide">
                            {isNew ? t("badgeNew") : t("badgeEdit")}
                        </Badge>
                        {!isNew && selected !== null && (
                            <span className="truncate text-muted-foreground text-xs">
                                {t("inspecting", { name: selected.name[locale] || t("untitled") })}
                            </span>
                        )}
                    </div>
                    <h2 className="truncate font-semibold text-foreground text-lg">
                        {draft.name[locale] || t("untitledHeader")}
                    </h2>
                </div>
                <div className="flex items-center gap-1">
                    {!isNew && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={t("deleteAria")}
                            onClick={() => onDelete(draft.id)}
                            className="size-8 text-muted-foreground hover:text-destructive"
                        >
                            <Trash2 className="size-4" aria-hidden="true" />
                        </Button>
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

            <div className="grid gap-4">
                <div className="grid gap-2">
                    <Label htmlFor="tag-name">{t("fields.name.label")}</Label>
                    <Input
                        id="tag-name"
                        value={draft.name[locale] ?? ""}
                        onChange={handleNameChange}
                        placeholder={t("fields.name.placeholder")}
                        autoComplete="off"
                        autoFocus={isNew}
                    />
                    <p className="text-muted-foreground text-xs">{t("fields.name.hint")}</p>
                </div>

                <div className="grid gap-2">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="tag-slug">{t("fields.slug.label")}</Label>
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
                        id="tag-slug"
                        value={draft.slug[locale] ?? ""}
                        onChange={handleSlugChange}
                        placeholder={t("fields.slug.placeholder")}
                    />
                    <p className="text-muted-foreground text-xs">{t("fields.slug.hint")}</p>
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="tag-description">{t("fields.description.label")}</Label>
                    <Textarea
                        id="tag-description"
                        value={draft.description?.[locale] ?? ""}
                        onChange={handleDescriptionChange}
                        placeholder={t("fields.description.placeholder")}
                        rows={3}
                    />
                    <p className="text-muted-foreground text-xs">{t("fields.description.hint")}</p>
                </div>

                {!isNew && (
                    <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/40 bg-muted/30 p-3 text-xs">
                        <Stat label={t("stats.products")} value={formatNumber(draft.productCount, locale)} />
                        <Stat label={t("stats.id")} value={`#${formatNumber(draft.id, locale)}`} />
                    </div>
                )}
            </div>

            <footer className="mt-auto flex flex-col gap-3 pt-2">
                <div className="inline-flex items-center gap-1 text-muted-foreground text-xs">
                    <Sparkles className="size-3" aria-hidden="true" />
                    {isNew ? t("footer.newHint") : t("footer.editHint")}
                </div>
                <div className="flex items-center justify-end gap-2">
                    <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                        {t("buttons.cancel")}
                    </Button>
                    <Button type="submit" disabled={submitting || draft.name[locale]?.trim().length === 0}>
                        <Save className="size-4" aria-hidden="true" />
                        {isNew ? t("buttons.create") : t("buttons.save")}
                    </Button>
                </div>
            </footer>
        </form>
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
