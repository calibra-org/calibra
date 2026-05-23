"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { formatNumber } from "#/lib/format";

interface MediaBulkBarProps {
    count: number;
    locale: Locale;
    onCancel: () => void;
    onBulkDelete: () => void;
}

/**
 * Top bar that surfaces above the toolbar whenever ≥ 1 row is selected. "Cancel" exits bulk
 * mode and clears the selection (the parent owns that logic); "Delete permanently" raises the
 * confirm dialog before firing the bulk-delete mutation.
 */
export function MediaBulkBar({ count, locale, onCancel, onBulkDelete }: MediaBulkBarProps) {
    const t = useTranslations("Media.bulk");
    return (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
            <div className="inline-flex items-center gap-2 text-foreground">
                <Badge className="bg-primary px-2 font-medium text-primary-foreground tabular-nums">
                    {formatNumber(count, locale)}
                </Badge>
                <span>{t("selected", { count })}</span>
            </div>
            <div className="flex items-center gap-1">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onCancel}
                    className="h-8 gap-1 px-2 text-muted-foreground"
                >
                    <X className="size-3.5" aria-hidden="true" />
                    {t("cancel")}
                </Button>
                <Button type="button" variant="destructive" size="sm" onClick={onBulkDelete} className="h-8 gap-1.5 px-3">
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    {t("delete")}
                </Button>
            </div>
        </div>
    );
}
