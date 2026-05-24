"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, GripVertical } from "lucide-react";
import { type ReactNode, useId } from "react";

import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";

interface SectionCardProps {
    sectionId: string;
    title: ReactNode;
    badge?: ReactNode;
    actions?: ReactNode;
    isCollapsible?: boolean;
    isDraggable?: boolean;
    isOpen: boolean;
    onOpenChange: (next: boolean) => void;
    collapseLabel: string;
    expandLabel: string;
    grabLabel: string;
    /** When true, this card is the drag source — render a muted placeholder while the `DragOverlay` shows the real preview. */
    isSourcePlaceholder?: boolean;
    children: ReactNode;
}

/**
 * One card inside a {@link DraggableSectionGrid}. Tight 40px header with an always-visible grip
 * handle (muted by default, brighter on hover/focus); body collapses to zero height when
 * `isOpen` is false. The grip is the ONLY drag-bound area — clicking the header background does
 * not initiate a drag, so the chevron and header actions stay unambiguous.
 *
 * The outer card is a plain `<div>` rather than shadcn's `<Card>` because `<Card>` is not a
 * `forwardRef` component and silently drops `ref` + `style`. dnd-kit needs both to apply the
 * translate transform during a drag — without them, drag-to-reorder feels broken.
 */
export function SectionCard({
    sectionId,
    title,
    badge,
    actions,
    isCollapsible = true,
    isDraggable = true,
    isOpen,
    onOpenChange,
    collapseLabel,
    expandLabel,
    grabLabel,
    isSourcePlaceholder = false,
    children,
}: SectionCardProps) {
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
        id: sectionId,
        disabled: !isDraggable,
    });
    const bodyId = useId();
    /**
     * When THIS card is the drag source, fade the whole card and suppress its body. The real
     * preview is rendered inside the {@link DragOverlay}; this faded version stays in the layout
     * so the sortable has a stable slot to swap against. We keep the header mounted so dnd-kit's
     * `setActivatorNodeRef` doesn't lose its DOM binding mid-drag.
     */
    const renderAsPlaceholder = isSourcePlaceholder || isDragging;

    return (
        <div
            ref={setNodeRef}
            data-section-id={sectionId}
            data-dragging={isDragging || undefined}
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
            }}
            className={cn(
                "rounded-lg border border-border bg-card text-card-foreground shadow-xs",
                "transition-shadow",
                renderAsPlaceholder && "border-border border-dashed bg-muted/30 opacity-50 shadow-none",
            )}
        >
            <header
                className={cn(
                    "flex h-10 items-center gap-2 px-2.5",
                    isOpen && !renderAsPlaceholder && "border-border/60 border-b",
                )}
            >
                {isDraggable && (
                    <button
                        type="button"
                        ref={setActivatorNodeRef}
                        {...attributes}
                        {...listeners}
                        className={cn(
                            "grid size-7 shrink-0 cursor-grab place-items-center rounded-md",
                            "text-muted-foreground/50 transition-colors",
                            "hover:bg-muted hover:text-foreground active:cursor-grabbing",
                            "outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        )}
                        aria-label={grabLabel}
                    >
                        <GripVertical className="size-4" aria-hidden="true" />
                    </button>
                )}
                <div className="flex min-w-0 flex-1 items-center gap-2">
                    <h3 className="truncate font-semibold text-foreground text-sm">{title}</h3>
                    {badge}
                </div>
                {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
                {isCollapsible && (
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-7 text-muted-foreground hover:text-foreground"
                        aria-expanded={isOpen}
                        aria-controls={bodyId}
                        aria-label={isOpen ? collapseLabel : expandLabel}
                        onClick={() => onOpenChange(!isOpen)}
                    >
                        <ChevronDown
                            className={cn("size-4 transition-transform duration-200", isOpen ? "rotate-180" : "rotate-0")}
                            aria-hidden="true"
                        />
                    </Button>
                )}
            </header>
            {isOpen && !renderAsPlaceholder && (
                <div id={bodyId} className="px-4 py-3">
                    {children}
                </div>
            )}
        </div>
    );
}

/** Re-exported small grip handle for niche cases where the activator needs to live outside the header. */
export function SectionGripHandle({ sectionId, label, className }: { sectionId: string; label: string; className?: string }) {
    const { attributes, listeners, setActivatorNodeRef } = useSortable({ id: sectionId });
    return (
        <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={label}
            className={cn("cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing", className)}
        >
            <GripVertical className="size-4" aria-hidden="true" />
        </button>
    );
}
