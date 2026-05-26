"use client";

import { cn } from "@calibra/shared";
import { ArrowLeft, ArrowRight, Loader2, Save } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { StatusBadge, type StatusTone } from "#/components/StatusBadge";
import { Button } from "#/components/ui/button";
import { Link } from "#/lib/i18n/navigation";

export interface DetailHeaderProps {
    titleFa: string;
    titleEn: string;
    sku: string | null;
    type: "simple" | "variable" | "grouped" | "external";
    status: "draft" | "publish" | "pending" | "private";
    updatedAt: string | null;
    isDirty: boolean;
    isSubmitting: boolean;
    onSave: () => void;
    isNew?: boolean;
}

const statusTone: Record<DetailHeaderProps["status"], StatusTone> = {
    publish: "success",
    draft: "neutral",
    pending: "warning",
    private: "info",
};

/**
 * Sticky header for the product detail page. Two rows: back link + actions row, then product
 * identity row (title / sku / type / status). The Save button reflects dirty + submitting state
 * and is the primary call-to-action; the More menu lives next to it (rendered by the parent so
 * the wrapper can hold the duplicate / trash mutations).
 */
export function DetailHeader({
    titleFa,
    titleEn,
    sku,
    type,
    status,
    updatedAt,
    isDirty,
    isSubmitting,
    onSave,
    isNew,
}: DetailHeaderProps) {
    const t = useTranslations("Products.detail");
    const tStatus = useTranslations("Products.list.statuses");
    const tType = useTranslations("Products.detail.types");
    const locale = useLocale();
    const isRtl = locale === "fa";
    const BackIcon = isRtl ? ArrowRight : ArrowLeft;
    const displayTitle = isRtl ? titleFa || titleEn : titleEn || titleFa;

    return (
        <div className="sticky top-0 z-30 -mx-4 mb-4 border-border border-b bg-background/95 px-4 py-3 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
                <Link
                    href="/products"
                    className="inline-flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
                >
                    <BackIcon className="size-3.5" aria-hidden="true" />
                    {t("backToList")}
                </Link>
                <Button type="button" onClick={onSave} disabled={(!isDirty && !isNew) || isSubmitting} className="min-w-32">
                    {isSubmitting ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                        <Save className="size-3.5" aria-hidden="true" />
                    )}
                    {isNew ? t("actions.create") : t("actions.save")}
                </Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
                <h1 className="truncate font-semibold text-foreground text-lg">{displayTitle || t("untitled")}</h1>
                <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                    {sku !== null && sku.length > 0 ? (
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono">{sku}</span>
                    ) : null}
                    <span
                        className={cn(
                            "rounded border border-border px-1.5 py-0.5",
                            type === "variable" && "border-violet-500/40 text-violet-600 dark:text-violet-300",
                        )}
                    >
                        {tType(type)}
                    </span>
                    <StatusBadge tone={statusTone[status]}>{tStatus(status)}</StatusBadge>
                    {updatedAt !== null ? (
                        <span dir="ltr" className="text-muted-foreground/80">
                            {t("lastEditedAt", { at: new Date(updatedAt).toLocaleString(isRtl ? "fa-IR" : "en-US") })}
                        </span>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
