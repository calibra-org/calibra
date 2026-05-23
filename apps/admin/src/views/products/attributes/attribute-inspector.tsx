"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Hash, Plus, Save, Settings2, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Switch } from "#/components/ui/switch";
import { formatNumber } from "#/lib/format";
import type { AdminAttribute, LocalizedString } from "#/lib/types";

import { slugifyAscii } from "../_taxonomy-shared/slugify";

/**
 * Attribute shape the inspector edits. Extends the read model with a per-locale `name` draft
 * (the API surface only ships the resolved locale's name on read, so the inspector keeps a
 * pair of strings and ships the active one on save).
 */
export interface AdminAttributeDraft extends AdminAttribute {
    nameDraft: LocalizedString;
}

interface AttributeInspectorProps {
    draft: AdminAttributeDraft | null;
    selected: AdminAttributeDraft | null;
    locale: Locale;
    submitting: boolean;
    onDraftChange: (draft: AdminAttributeDraft) => void;
    onCreateNew: () => void;
    onSave: (draft: AdminAttributeDraft) => void;
    onDelete: (id: number) => void;
    onClose: () => void;
}

const ORDER_BY_OPTIONS: AdminAttribute["orderBy"][] = ["menu_order", "name", "id"];

/**
 * Right-hand pane. Doubles as a permanent "add attribute" form when no row is selected.
 * Fields: name, slug (== API `code`, immutable after create), has-archives switch, default
 * term order. The slug input is disabled on edit because the API rejects `code` changes —
 * operators rename via the translation, not the URL key.
 */
export function AttributeInspector({
    draft,
    selected,
    locale,
    submitting,
    onDraftChange,
    onCreateNew,
    onSave,
    onDelete,
    onClose,
}: AttributeInspectorProps) {
    const t = useTranslations("Attributes.inspector");

    if (draft === null) {
        return <InspectorEmpty onCreate={onCreateNew} />;
    }

    /** Remount on row swap so inner state (`slugTouched`) resets. */
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
    const t = useTranslations("Attributes.inspector.empty");
    return (
        <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed bg-card/40 p-8 text-center">
            <div className="grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
                <Settings2 className="size-6" aria-hidden="true" />
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
    t: ReturnType<typeof useTranslations<"Attributes.inspector">>;
    draft: AdminAttributeDraft;
    selected: AdminAttributeDraft | null;
    locale: Locale;
    submitting: boolean;
    onDraftChange: (draft: AdminAttributeDraft) => void;
    onSave: (draft: AdminAttributeDraft) => void;
    onDelete: (id: number) => void;
    onClose: () => void;
}

function InspectorForm({ t, draft, selected, locale, submitting, onDraftChange, onSave, onDelete, onClose }: InspectorFormProps) {
    const [slugTouched, setSlugTouched] = useState(false);
    const isNew = draft.id < 0;
    const tOrderBy = useTranslations("Attributes.orderBy");

    /**
     * Auto-derive the `code` (slug) from the name on create only — the field is locked on
     * edit because the API rejects code changes after create.
     */
    useEffect(() => {
        if (!isNew || slugTouched) return;
        const next = slugifyAscii(draft.nameDraft[locale] ?? "");
        if (next.length === 0) return;
        if (draft.code === next) return;
        onDraftChange({ ...draft, code: next });
    }, [draft, isNew, locale, onDraftChange, slugTouched]);

    const handleNameChange = (event: ChangeEvent<HTMLInputElement>) => {
        onDraftChange({
            ...draft,
            nameDraft: { ...draft.nameDraft, [locale]: event.target.value },
            name: { ...draft.name, [locale]: event.target.value },
        });
    };
    const handleSlugChange = (event: ChangeEvent<HTMLInputElement>) => {
        if (!isNew) return;
        setSlugTouched(true);
        onDraftChange({ ...draft, code: slugifyAscii(event.target.value) });
    };
    const handleHasArchivesChange = (next: boolean | "indeterminate") => {
        onDraftChange({ ...draft, hasArchives: next === true });
    };
    const handleOrderByChange = (value: AdminAttribute["orderBy"]) => {
        onDraftChange({ ...draft, orderBy: value });
    };

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (submitting) return;
        if (draft.nameDraft[locale]?.trim().length === 0) return;
        if (isNew && draft.code.length === 0) return;
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
                                {t("inspecting", { name: selected.nameDraft[locale] || t("untitled") })}
                            </span>
                        )}
                    </div>
                    <h2 className="truncate font-semibold text-foreground text-lg">
                        {draft.nameDraft[locale] || t("untitledHeader")}
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
                    <Label htmlFor="attr-name">{t("fields.name.label")}</Label>
                    <Input
                        id="attr-name"
                        value={draft.nameDraft[locale] ?? ""}
                        onChange={handleNameChange}
                        placeholder={t("fields.name.placeholder")}
                        autoComplete="off"
                        autoFocus={isNew}
                    />
                    <p className="text-muted-foreground text-xs">{t("fields.name.hint")}</p>
                </div>

                <div className="grid gap-2">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="attr-slug">{t("fields.slug.label")}</Label>
                        {isNew && slugTouched && (
                            <button
                                type="button"
                                onClick={() => {
                                    setSlugTouched(false);
                                    onDraftChange({ ...draft, code: slugifyAscii(draft.nameDraft[locale] ?? "") });
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
                            id="attr-slug"
                            value={draft.code}
                            onChange={handleSlugChange}
                            placeholder={t("fields.slug.placeholder")}
                            dir="ltr"
                            autoComplete="off"
                            disabled={!isNew}
                            className="ps-9 font-mono"
                        />
                    </div>
                    <p className="text-muted-foreground text-xs">{t("fields.slug.hint")}</p>
                </div>

                <div className="grid gap-2">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <Label htmlFor="attr-archives">{t("fields.hasArchives.label")}</Label>
                            <p className="text-muted-foreground text-xs">{t("fields.hasArchives.hint")}</p>
                        </div>
                        <Switch id="attr-archives" checked={draft.hasArchives} onCheckedChange={handleHasArchivesChange} />
                    </div>
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="attr-order-by">{t("fields.orderBy.label")}</Label>
                    <Select value={draft.orderBy} onValueChange={(v) => handleOrderByChange(v as AdminAttribute["orderBy"])}>
                        <SelectTrigger id="attr-order-by">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {ORDER_BY_OPTIONS.map((opt) => (
                                <SelectItem key={opt} value={opt}>
                                    {tOrderBy(opt)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <p className="text-muted-foreground text-xs">{t("fields.orderBy.hint")}</p>
                </div>

                {!isNew && (
                    <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/40 bg-muted/30 p-3 text-xs">
                        <Stat label={t("stats.terms")} value={formatNumber(draft.termCount, locale)} />
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
                    <Button
                        type="submit"
                        disabled={
                            submitting || draft.nameDraft[locale]?.trim().length === 0 || (isNew && draft.code.length === 0)
                        }
                    >
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
