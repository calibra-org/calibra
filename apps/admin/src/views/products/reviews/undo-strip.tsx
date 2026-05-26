"use client";

import { Trash2, Undo2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "#/components/ui/button";

export type PendingKind = "trash" | "spam";

interface UndoStripProps {
    kind: PendingKind;
    reviewerName: string;
    onUndo: () => void;
    /** Optional inline dismiss — hides the strip without calling Undo (the API change stays). */
    onDismiss?: () => void;
}

/**
 * Inline replacement for a row that has just been trashed or marked as spam. The mutation has
 * already fired by the time this renders; the Undo button just calls the reverse mutation. The
 * strip is persistent — it stays visible until the operator clicks Undo, dismisses it, or
 * navigates away. No countdown, no auto-commit.
 */
export function UndoStrip({ kind, reviewerName, onUndo, onDismiss }: UndoStripProps) {
    const t = useTranslations("Reviews.list");

    const message =
        kind === "trash" ? t("pendingTrashMessage", { name: reviewerName }) : t("pendingSpamMessage", { name: reviewerName });
    const icon =
        kind === "trash" ? (
            <Trash2 className="size-4 text-danger" aria-hidden="true" />
        ) : (
            <XCircle className="size-4 text-warning" aria-hidden="true" />
        );

    return (
        <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2.5">
                {icon}
                <span className="text-foreground text-sm">{message}</span>
            </div>
            <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={onUndo} className="h-7 gap-1.5">
                    <Undo2 className="size-3.5" aria-hidden="true" />
                    {t("undo")}
                </Button>
                {onDismiss !== undefined && (
                    <Button variant="ghost" size="sm" onClick={onDismiss} className="h-7 px-2 text-muted-foreground">
                        {t("dismiss")}
                    </Button>
                )}
            </div>
        </div>
    );
}
