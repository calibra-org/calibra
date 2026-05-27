"use client";

import { useTranslations } from "next-intl";

import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#/components/ui/dialog";

export interface ConflictDialogProps {
    open: boolean;
    serverUpdatedAt: string | null;
    onReload: () => void;
    onOverwrite: () => void;
    onClose: () => void;
}

/**
 * Surfaces an If-Match 409 from the api. The operator picks between reloading the server's
 * current copy (discarding their in-flight edits) or overwriting (re-submitting without the
 * If-Match header so the next write succeeds). "View diff" is intentionally a follow-up —
 * surfacing a real per-field diff requires the server to also echo the previous state, which
 * the current 409 body doesn't include.
 */
export function ConflictDialog({ open, serverUpdatedAt, onReload, onOverwrite, onClose }: ConflictDialogProps) {
    const t = useTranslations("Products.detail.conflictDialog");
    return (
        <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t("title")}</DialogTitle>
                    <DialogDescription>{t("message")}</DialogDescription>
                </DialogHeader>
                {serverUpdatedAt !== null ? (
                    <p className="font-mono text-muted-foreground text-xs" dir="ltr">
                        {serverUpdatedAt}
                    </p>
                ) : null}
                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={onReload}>
                        {t("reload")}
                    </Button>
                    <Button variant="destructive" onClick={onOverwrite}>
                        {t("overwrite")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
