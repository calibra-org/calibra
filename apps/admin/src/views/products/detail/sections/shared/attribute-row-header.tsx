"use client";

import type { useSortable } from "@dnd-kit/sortable";
import type { ReactNode } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { ChevronDown, ChevronRight, GripVertical, Trash2 } from "#/icons";
import { cn } from "#/lib/utils";

export interface AttributeRowHeaderProps {
    /** dnd-kit sortable listeners restricted to the grip handle. */
    listeners: ReturnType<typeof useSortable>["listeners"];
    expanded: boolean;
    onToggleExpand: () => void;
    onRemove: () => void;
    title: string;
    /** Trailing pill (e.g. "3 values"). Omit when count is 0 so the bar stays clean. */
    countBadge?: ReactNode;
    /** Drag handle aria label (translated). */
    dragHandleLabel: string;
    dragHandleTooltip: string;
    expandLabel: string;
    collapseLabel: string;
    removeLabel: string;
}

/**
 * Always-visible collapsed bar shared by Specs + Customer choices rows. The drag handle gets
 * its own left-edge rail with a soft tinted background — that strip IS the only drag affordance
 * for the row, so chevrons, inline chips, and the Remove button stay click-only. The strip
 * widens its visual weight on row hover (and stays active during drag) so the operator can
 * scan a stack of rows and immediately see where to grab.
 */
export function AttributeRowHeader({
    listeners,
    expanded,
    onToggleExpand,
    onRemove,
    title,
    countBadge,
    dragHandleLabel,
    dragHandleTooltip,
    expandLabel,
    collapseLabel,
    removeLabel,
}: AttributeRowHeaderProps) {
    return (
        <div className="flex items-stretch">
            <button
                type="button"
                aria-label={dragHandleLabel}
                title={dragHandleTooltip}
                {...listeners}
                className={cn(
                    "flex w-7 shrink-0 cursor-grab items-center justify-center self-stretch border-border border-e bg-muted/40 text-muted-foreground/60 transition-colors",
                    "hover:bg-muted hover:text-foreground active:cursor-grabbing active:bg-muted",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                )}
            >
                <GripVertical className="size-4" aria-hidden="true" />
            </button>
            <div className="flex flex-1 items-center gap-2 px-2 py-1.5">
                <button
                    type="button"
                    aria-label={expanded ? collapseLabel : expandLabel}
                    aria-expanded={expanded}
                    onClick={onToggleExpand}
                    className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                >
                    {expanded ? (
                        <ChevronDown className="size-4" aria-hidden="true" />
                    ) : (
                        <ChevronRight className="size-4" data-rtl-flip aria-hidden="true" />
                    )}
                </button>
                <span className="min-w-0 flex-1 truncate font-medium text-foreground text-sm">{title}</span>
                {countBadge !== undefined && countBadge !== null ? (
                    <Badge variant="secondary" className="tabular-nums">
                        {countBadge}
                    </Badge>
                ) : null}
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-muted-foreground hover:text-destructive"
                    onClick={onRemove}
                >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    {removeLabel}
                </Button>
            </div>
        </div>
    );
}
