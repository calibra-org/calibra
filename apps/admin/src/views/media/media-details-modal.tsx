"use client";

import type { Locale } from "@calibra/shared/i18n";
import { ChevronLeft, ChevronRight, Copy, Download, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { toast } from "#/components/ui/toast";
import { formatDate } from "#/lib/format";
import type { AdminMedia } from "#/lib/types";
import { cn } from "#/lib/utils";

import { classifyMediaType, formatFileSize, type MediaCategory } from "./types";

interface MediaDetailsModalProps {
    open: boolean;
    row: AdminMedia | null;
    locale: Locale;
    canPrev: boolean;
    canNext: boolean;
    saving: boolean;
    deleting: boolean;
    onClose: () => void;
    onPrev: () => void;
    onNext: () => void;
    onSave: (patch: {
        title?: string | null;
        alt?: string | null;
        caption?: string | null;
        description?: string | null;
    }) => Promise<void>;
    onDelete: () => void;
}

/**
 * Detail modal — built on shadcn `Dialog`. Two-column layout on large screens (preview on the
 * left, metadata + form on the right); collapses to a single column under `lg`. The form
 * auto-saves on blur (debounced through {@link onSave}); the right pane footer mirrors the
 * link cluster from the WordPress media modal — View / Edit details / Download / Delete.
 *
 * The built-in Dialog "Close" button covers the X in the corner. Prev/Next arrows live in our
 * own header below it.
 */
export function MediaDetailsModal({
    open,
    row,
    locale,
    canPrev,
    canNext,
    saving,
    deleting,
    onClose,
    onPrev,
    onNext,
    onSave,
    onDelete,
}: MediaDetailsModalProps) {
    const t = useTranslations("Media.modal");
    const tFields = useTranslations("Media.modal.fields");
    const tMetadata = useTranslations("Media.modal.metadata");
    const tButtons = useTranslations("Media.modal.buttons");
    const tFooter = useTranslations("Media.modal.footerLinks");

    return (
        <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
            <DialogContent className="max-w-5xl">
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={onPrev}
                        disabled={!canPrev}
                        aria-label={t("previousAria")}
                    >
                        <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={onNext}
                        disabled={!canNext}
                        aria-label={t("nextAria")}
                    >
                        <ChevronRight className="size-4 rtl:rotate-180" aria-hidden="true" />
                    </Button>
                    <DialogTitle className="text-base">{t("title")}</DialogTitle>
                </div>

                {row === null ? (
                    <MissingState />
                ) : (
                    <Body
                        key={row.id}
                        row={row}
                        locale={locale}
                        saving={saving}
                        deleting={deleting}
                        onSave={onSave}
                        onDelete={onDelete}
                        onClose={onClose}
                        labels={{ t, tFields, tMetadata, tButtons, tFooter }}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}

interface BodyProps {
    row: AdminMedia;
    locale: Locale;
    saving: boolean;
    deleting: boolean;
    onSave: MediaDetailsModalProps["onSave"];
    onDelete: () => void;
    onClose: () => void;
    labels: {
        t: ReturnType<typeof useTranslations<"Media.modal">>;
        tFields: ReturnType<typeof useTranslations<"Media.modal.fields">>;
        tMetadata: ReturnType<typeof useTranslations<"Media.modal.metadata">>;
        tButtons: ReturnType<typeof useTranslations<"Media.modal.buttons">>;
        tFooter: ReturnType<typeof useTranslations<"Media.modal.footerLinks">>;
    };
}

function Body({ row, locale, saving, deleting, onSave, onDelete, onClose, labels }: BodyProps) {
    const { t, tFields, tMetadata, tButtons, tFooter } = labels;
    const [title, setTitle] = useState(row.title ?? "");
    const [alt, setAlt] = useState(row.alt ?? "");
    const [caption, setCaption] = useState(row.caption ?? "");
    const [description, setDescription] = useState(row.description ?? "");

    useEffect(() => {
        setTitle(row.title ?? "");
        setAlt(row.alt ?? "");
        setCaption(row.caption ?? "");
        setDescription(row.description ?? "");
    }, [row]);

    /**
     * Build the patch payload from the four editable fields, dropping ones the operator hasn't
     * touched (so we don't `null`-out values that other workflows may have set).
     */
    const buildPatch = useCallback(() => {
        const patch: { title?: string | null; alt?: string | null; caption?: string | null; description?: string | null } = {};
        if (title !== (row.title ?? "")) patch.title = title.length === 0 ? null : title;
        if (alt !== (row.alt ?? "")) patch.alt = alt.length === 0 ? null : alt;
        if (caption !== (row.caption ?? "")) patch.caption = caption.length === 0 ? null : caption;
        if (description !== (row.description ?? "")) patch.description = description.length === 0 ? null : description;
        return patch;
    }, [title, alt, caption, description, row]);

    const dirty =
        title !== (row.title ?? "") ||
        alt !== (row.alt ?? "") ||
        caption !== (row.caption ?? "") ||
        description !== (row.description ?? "");

    const persistOnBlur = useCallback(
        async (field: "title" | "alt" | "caption" | "description", current: string) => {
            const previous = (row[field] ?? "") as string;
            if (current === previous) return;
            try {
                await onSave({ [field]: current.length === 0 ? null : current });
                toast.add({ title: t("savedToast"), timeout: 2000, data: { tone: "success" } });
            } catch {
                toast.add({ title: t("saveFailedToast"), timeout: 3000, data: { tone: "error" } });
            }
        },
        [row, onSave, t],
    );

    /**
     * Explicit "save changes" path — fires the same `onSave` patch through one round-trip across
     * every dirty field, then closes the modal so the operator sees the saved state reflected in
     * the underlying grid. Pairs with the blur-autosave above; both routes invalidate the same
     * listing cache. We only close on the explicit-save path because blur is fire-and-forget — an
     * operator tabbing between fields shouldn't have the modal disappear underneath them.
     */
    const handleSaveAll = useCallback(async () => {
        const patch = buildPatch();
        if (Object.keys(patch).length === 0) {
            onClose();
            return;
        }
        try {
            await onSave(patch);
            toast.add({ title: t("savedToast"), timeout: 2000, data: { tone: "success" } });
            onClose();
        } catch {
            toast.add({ title: t("saveFailedToast"), timeout: 3000, data: { tone: "error" } });
        }
    }, [buildPatch, onClose, onSave, t]);

    const handleCopyUrl = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(row.url);
            toast.add({ title: t("copyToast"), timeout: 2000, data: { tone: "success" } });
        } catch {
            toast.add({ title: t("saveFailedToast"), timeout: 3000, data: { tone: "error" } });
        }
    }, [row.url, t]);

    const category = classifyMediaType(row.mime);
    const dimensions = row.width !== null && row.height !== null ? `${row.width} × ${row.height}` : null;

    return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
            <div className="flex flex-col gap-3">
                <PreviewPane row={row} category={category} previewMissingAlt={t("previewMissingAlt")} />
                {category === "image" && (
                    <div>
                        <Button type="button" variant="outline" size="sm" disabled title={tButtons("editImageSoon")}>
                            <Pencil className="size-3.5" aria-hidden="true" />
                            {tButtons("editImage")}
                        </Button>
                    </div>
                )}
            </div>

            <div className="flex flex-col gap-4">
                <dl className="grid grid-cols-2 gap-3 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs">
                    <Metadata label={tMetadata("filename")} value={row.filename} mono />
                    <Metadata label={tMetadata("filetype")} value={row.mime ?? "—"} mono />
                    <Metadata label={tMetadata("filesize")} value={formatFileSize(row.sizeBytes, locale)} />
                    {dimensions !== null && <Metadata label={tMetadata("dimensions")} value={dimensions} />}
                    <Metadata
                        label={t("uploadedAt")}
                        value={
                            row.createdAt !== null
                                ? formatDate(row.createdAt, locale, { year: "numeric", month: "long", day: "numeric" })
                                : "—"
                        }
                    />
                    <Metadata label={t("uploadedBy")} value={row.uploadedByUserId === null ? "—" : `#${row.uploadedByUserId}`} />
                </dl>

                <div className="flex flex-col gap-3">
                    <FormField label={tFields("alt")} helper={tFields("altHelper")}>
                        <Input
                            value={alt}
                            onChange={(event) => setAlt(event.target.value)}
                            onBlur={() => persistOnBlur("alt", alt)}
                        />
                    </FormField>
                    <FormField label={tFields("title")}>
                        <Input
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            onBlur={() => persistOnBlur("title", title)}
                        />
                    </FormField>
                    <FormField label={tFields("caption")}>
                        <Textarea
                            rows={2}
                            value={caption}
                            onChange={(event) => setCaption(event.target.value)}
                            onBlur={() => persistOnBlur("caption", caption)}
                        />
                    </FormField>
                    <FormField label={tFields("description")}>
                        <Textarea
                            rows={3}
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            onBlur={() => persistOnBlur("description", description)}
                        />
                    </FormField>
                    <FormField label={tFields("url")}>
                        <div className="flex items-center gap-1.5">
                            <Input value={row.url} readOnly dir="ltr" className="font-mono text-xs" />
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="size-9 shrink-0"
                                aria-label={tButtons("copyUrl")}
                                onClick={handleCopyUrl}
                            >
                                <Copy className="size-3.5" aria-hidden="true" />
                            </Button>
                        </div>
                    </FormField>

                    <div className="flex items-center justify-end gap-2 border-border/60 border-t pt-3">
                        <Button type="button" size="sm" onClick={handleSaveAll} disabled={!dirty || saving} className="gap-1.5">
                            {saving ? t("savingButton") : t("saveButton")}
                        </Button>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 border-border/60 border-t pt-3 text-xs">
                    <FooterLink icon={ExternalLink} href={row.url} label={tFooter("view")} />
                    <FooterLink icon={Download} href={row.url} label={tFooter("download")} download={row.filename} />
                    <button
                        type="button"
                        onClick={onDelete}
                        disabled={deleting}
                        className={cn(
                            "ms-auto inline-flex items-center gap-1 rounded text-destructive transition-colors hover:text-destructive/80",
                            deleting && "opacity-60",
                        )}
                    >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                        {tFooter("delete")}
                    </button>
                </div>
            </div>
        </div>
    );
}

interface MetadataProps {
    label: string;
    value: string;
    mono?: boolean;
}

function Metadata({ label, value, mono }: MetadataProps) {
    return (
        <div className="flex flex-col gap-0.5">
            <dt className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">{label}</dt>
            <dd className={cn("truncate text-foreground", mono === true && "font-mono")} dir={mono === true ? "ltr" : undefined}>
                {value}
            </dd>
        </div>
    );
}

interface FormFieldProps {
    label: string;
    helper?: string;
    children: React.ReactNode;
}

function FormField({ label, helper, children }: FormFieldProps) {
    return (
        <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{label}</Label>
            {children}
            {helper !== undefined && <p className="text-[11px] text-muted-foreground">{helper}</p>}
        </div>
    );
}

interface FooterLinkProps {
    icon: typeof Pencil;
    href: string;
    label: string;
    download?: string;
}

function FooterLink({ icon: Icon, href, label, download }: FooterLinkProps) {
    return (
        <a
            href={href}
            target={download === undefined ? "_blank" : undefined}
            rel={download === undefined ? "noreferrer" : undefined}
            download={download}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
        >
            <Icon className="size-3.5" aria-hidden="true" />
            {label}
        </a>
    );
}

interface PreviewPaneProps {
    row: AdminMedia;
    category: MediaCategory;
    previewMissingAlt: string;
}

function PreviewPane({ row, category, previewMissingAlt }: PreviewPaneProps) {
    if (category === "image") {
        return (
            <div className="flex min-h-[300px] items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-muted/30">
                {/* biome-ignore lint/performance/noImgElement: external thumbnails, no Next/Image loader configured */}
                <img
                    src={row.url}
                    alt={row.alt ?? row.filename ?? previewMissingAlt}
                    className="max-h-[60vh] w-full object-contain"
                />
            </div>
        );
    }
    if (category === "video") {
        return (
            <div className="flex min-h-[300px] items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-black">
                <video src={row.url} controls className="max-h-[60vh] w-full">
                    <track kind="captions" />
                </video>
            </div>
        );
    }
    if (category === "audio") {
        return (
            <div className="flex min-h-[160px] items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-muted/30 p-6">
                <audio src={row.url} controls className="w-full">
                    <track kind="captions" />
                </audio>
            </div>
        );
    }
    return (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-2 rounded-xl border border-border/60 bg-muted/30 text-muted-foreground">
            <span className="font-mono text-xs">{row.filename}</span>
            <span className="text-[11px]">{row.mime ?? ""}</span>
        </div>
    );
}

function MissingState() {
    const t = useTranslations("Media.modal.missing");
    return (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <h3 className="font-medium text-foreground">{t("title")}</h3>
            <p className="text-sm">{t("description")}</p>
        </div>
    );
}
