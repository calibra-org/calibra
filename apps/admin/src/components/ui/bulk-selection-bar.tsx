"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Trash2, X } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { StickyActionBar } from "#/components/ui/sticky-action-bar";
import { formatNumber } from "#/lib/format";

interface BulkSelectionBarLabels {
    /** Localized "N selected" label. ICU-style — receives `{count}`. */
    selected: string;
    /** Cancel-selection button label. */
    cancel: string;
    /** Destructive primary action label (typically "Delete forever"). */
    delete: string;
}

interface BulkSelectionBarProps {
    /** Selected row count. Drives both the badge and the bar's open/closed state. */
    count: number;
    locale: Locale;
    labels: BulkSelectionBarLabels;
    /** Cancel (clear selection) handler. */
    onCancel: () => void;
    /** Destructive primary action — usually opens a confirm dialog before firing. */
    onDelete: () => void;
    /**
     * Optional extra actions injected before the cancel / delete cluster — useful for surfaces
     * that need bulk status changes, exports, etc. (e.g. the products list). Pass any composable
     * button(s); the bar handles spacing.
     */
    extraActions?: ReactNode;
}

/**
 * Floating bottom-center bar that appears whenever the operator has selected one or more rows
 * across the workbenches. Standardises the count badge + cancel + delete pattern that used to
 * live inline at the top of every listing card. Five surfaces shared the exact same shape
 * before this abstraction — see the git history.
 *
 * Hovers above content via {@link StickyActionBar}; the page's scroll position never jumps when
 * the bar appears or disappears.
 */
export function BulkSelectionBar({ count, locale, labels, onCancel, onDelete, extraActions }: BulkSelectionBarProps) {
    return (
        <StickyActionBar open={count > 0} ariaLabel={labels.selected}>
            <div className="inline-flex items-center gap-2 text-foreground">
                <Badge className="bg-primary px-2 font-medium text-primary-foreground tabular-nums">
                    {formatNumber(count, locale)}
                </Badge>
                <span>{labels.selected}</span>
            </div>
            <div className="h-5 w-px bg-border/70" aria-hidden="true" />
            <div className="flex items-center gap-1">
                {extraActions}
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onCancel}
                    className="h-8 gap-1 px-2 text-muted-foreground"
                >
                    <X className="size-3.5" aria-hidden="true" />
                    {labels.cancel}
                </Button>
                <Button type="button" variant="destructive" size="sm" onClick={onDelete} className="h-8 gap-1.5 px-3">
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    {labels.delete}
                </Button>
            </div>
        </StickyActionBar>
    );
}
