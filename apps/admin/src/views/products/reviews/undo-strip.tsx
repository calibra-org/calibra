"use client";

import { Trash2, Undo2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Button } from "#/components/ui/button";

export type PendingKind = "trash" | "spam";

interface UndoStripProps {
    kind: PendingKind;
    reviewerName: string;
    /** Total TTL for this pending action, in milliseconds. */
    durationMs: number;
    /** Wall-clock time at which the action commits. Used to drive the live countdown. */
    expiresAt: number;
    onUndo: () => void;
}

/**
 * Gmail-style inline undo strip that replaces a row's cells while the trash / spam action sits
 * in its grace window. A thin progress bar burns down so the operator can see exactly how long
 * they have to undo before the mutation commits.
 */
export function UndoStrip({ kind, reviewerName, durationMs, expiresAt, onUndo }: UndoStripProps) {
    const t = useTranslations("Reviews.list");
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), 100);
        return () => window.clearInterval(id);
    }, []);

    const remaining = Math.max(0, expiresAt - now);
    const pct = Math.max(0, Math.min(100, (remaining / durationMs) * 100));

    const message =
        kind === "trash" ? t("pendingTrashMessage", { name: reviewerName }) : t("pendingSpamMessage", { name: reviewerName });
    const icon =
        kind === "trash" ? (
            <Trash2 className="size-4 text-rose-500" aria-hidden="true" />
        ) : (
            <XCircle className="size-4 text-amber-500" aria-hidden="true" />
        );

    return (
        <div className="relative flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2.5">
                {icon}
                <span className="text-foreground text-sm">{message}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={onUndo} className="h-7 gap-1.5">
                <Undo2 className="size-3.5" aria-hidden="true" />
                {t("undo")}
            </Button>
            {/**
             * Progress bar across the bottom edge — drains as the grace window closes. We tile a
             * fixed-position pseudo-element rather than animating width directly so RTL doesn't
             * flip the burn-down direction; logical `inset-x-0` keeps it edge-to-edge in either
             * direction.
             */}
            <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 bg-primary/30" style={{ width: `${pct}%` }} />
        </div>
    );
}
