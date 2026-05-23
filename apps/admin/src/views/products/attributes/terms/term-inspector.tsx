"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Hash, Plus, Save, Sparkles, Tag as TagIcon, Trash2, Wand2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { formatNumber } from "#/lib/format";
import type { AdminAttributeTerm, LocalizedString } from "#/lib/types";

import { slugify } from "../../_taxonomy-shared/slugify";

/**
 * Term shape the inspector edits. `description` is local-only today (mirrors tags / brands);
 * the API persists it on POST/PATCH but the listing doesn't echo it back, so the draft
 * carries it and we ship it on save.
 */
export interface AdminAttributeTermDraft extends AdminAttributeTerm {
    description?: LocalizedString;
}

interface TermInspectorProps {
    draft: AdminAttributeTermDraft | null;
    selected: AdminAttributeTermDraft | null;
    locale: Locale;
    submitting: boolean;
    onDraftChange: (draft: AdminAttributeTermDraft) => void;
    onCreateNew: () => void;
    onSave: (draft: AdminAttributeTermDraft) => void;
    onDelete: (id: number) => void;
    onClose: () => void;
}

export function TermInspector({
    draft,
    selected,
    locale,
    submitting,
    onDraftChange,
    onCreateNew,
    onSave,
    onDelete,
    onClose,
}: TermInspectorProps) {
    const t = useTranslations("AttributeTerms.inspector");
    if (draft === null) return <InspectorEmpty onCreate={onCreateNew} />;
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
        />
    );
}

interface InspectorEmptyProps {
    onCreate: () => void;
}

function InspectorEmpty({ onCreate }: InspectorEmptyProps) {
    const t = useTranslations("AttributeTerms.inspector.empty");
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
            </ul>
        </div>
    );
}

interface InspectorFormProps {
    t: ReturnType<typeof useTranslations<"AttributeTerms.inspector">>;
    draft: AdminAttributeTermDraft;
    selected: AdminAttributeTermDraft | null;
    locale: Locale;
    submitting: boolean;
    onDraftChange: (draft: AdminAttributeTermDraft) => void;
    onSave: (draft: AdminAttributeTermDraft) => void;
    onDelete: (id: number) => void;
    onClose: () => void;
}

function InspectorForm({ t, draft, selected, locale, submitting, onDraftChange, onSave, onDelete, onClose }: InspectorFormProps) {
    const [slugTouched, setSlugTouched] = useState(false);
    const isNew = draft.id < 0;

    useEffect(() => {
        if (slugTouched) return;
        const next = slugify(draft.name[locale] ?? "");
        if (draft.slug === next) return;
        onDraftChange({ ...draft, slug: next });
    }, [draft, locale, onDraftChange, slugTouched]);

    const handleNameChange = (event: ChangeEvent<HTMLInputElement>) => {
        onDraftChange({ ...draft, name: { ...draft.name, [locale]: event.target.value } });
    };
    const handleSlugChange = (event: ChangeEvent<HTMLInputElement>) => {
        setSlugTouched(true);
        onDraftChange({ ...draft, slug: event.target.value });
    };
    const handleDescriptionChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
        const current = (draft.description ?? { fa: "", en: "" }) as LocalizedString;
        onDraftChange({ ...draft, description: { ...current, [locale]: event.target.value } });
    };

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (submitting) return;
        if (draft.name[locale]?.trim().length === 0) return;
        onSave(draft);
    };

    return (
        <form
            onSubmit={handleSubmit}
            className="flex h-full flex-col gap-5 rounded-2xl border border-border/60 bg-card p-5 shadow-sm"
        >
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
                    <Label htmlFor="term-name">{t("fields.name.label")}</Label>
                    <Input
                        id="term-name"
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
                        <Label htmlFor="term-slug">{t("fields.slug.label")}</Label>
                        {slugTouched && (
                            <button
                                type="button"
                                onClick={() => {
                                    setSlugTouched(false);
                                    onDraftChange({ ...draft, slug: slugify(draft.name[locale] ?? "") });
                                }}
                                className="inline-flex items-center gap-1 text-primary text-xs hover:underline"
                            >
                                <Wand2 className="size-3" aria-hidden="true" />
                                {t("fields.slug.regenerate")}
                            </button>
                        )}
                    </div>
                    <div className="relative">
                        <Hash
                            className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <Input
                            id="term-slug"
                            value={draft.slug}
                            onChange={handleSlugChange}
                            placeholder={t("fields.slug.placeholder")}
                            dir="ltr"
                            autoComplete="off"
                            className="ps-9 font-mono"
                        />
                    </div>
                    <p className="text-muted-foreground text-xs">{t("fields.slug.hint")}</p>
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="term-description">{t("fields.description.label")}</Label>
                    <Textarea
                        id="term-description"
                        value={draft.description?.[locale] ?? ""}
                        onChange={handleDescriptionChange}
                        placeholder={t("fields.description.placeholder")}
                        rows={3}
                    />
                    <p className="text-muted-foreground text-xs">{t("fields.description.hint")}</p>
                </div>

                {!isNew && (
                    <div className="grid grid-cols-1 gap-2 rounded-lg border border-border/40 bg-muted/30 p-3 text-xs">
                        <Stat label={t("stats.id")} value={`#${formatNumber(draft.id, locale)}`} />
                    </div>
                )}
            </div>

            <footer className="mt-auto flex items-center justify-between gap-2 pt-2">
                <div className="inline-flex items-center gap-1 text-muted-foreground text-xs">
                    <Sparkles className="size-3" aria-hidden="true" />
                    {isNew ? t("footer.newHint") : t("footer.editHint")}
                </div>
                <div className="flex items-center gap-2">
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
