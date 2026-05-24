"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, GripVertical } from "lucide-react";
import { type ReactNode, useId } from "react";

import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader } from "#/components/ui/card";
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
    children: ReactNode;
}

/**
 * One card inside a {@link DraggableSectionGrid}. The header carries a grip handle (drag), an
 * optional badge chip, the title, an actions slot, and a chevron toggle. The card body collapses
 * via height transition when `isOpen` is false. The grip is the ONLY drag-bound area — clicking
 * elsewhere on the header does not initiate a drag, so toggling collapse and using header actions
 * stays unambiguous.
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
    children,
}: SectionCardProps) {
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
        id: sectionId,
        disabled: !isDraggable,
    });
    const bodyId = useId();

    return (
        <Card
            ref={setNodeRef}
            data-section-id={sectionId}
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
            }}
            className={cn("border-border/70 shadow-xs transition-shadow", isDragging && "z-10 shadow-lg ring-2 ring-primary/40")}
        >
            <CardHeader
                className={cn(
                    "flex items-center justify-between gap-3 border-border/60 border-b py-2.5 ps-2 pe-3",
                    !isOpen && "border-transparent",
                )}
            >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                    {isDraggable && (
                        <button
                            type="button"
                            ref={setActivatorNodeRef}
                            {...attributes}
                            {...listeners}
                            className={cn(
                                "grid size-7 shrink-0 cursor-grab place-items-center rounded-md text-muted-foreground/60 transition-colors",
                                "hover:bg-muted hover:text-foreground active:cursor-grabbing",
                                "opacity-0 focus-visible:opacity-100 group-hover/section:opacity-100",
                                "outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            )}
                            aria-label={grabLabel}
                        >
                            <GripVertical className="size-4" aria-hidden="true" />
                        </button>
                    )}
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                        <h3 className="truncate font-semibold text-sm">{title}</h3>
                        {badge}
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    {actions}
                    {isCollapsible && (
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            aria-expanded={isOpen}
                            aria-controls={bodyId}
                            aria-label={isOpen ? collapseLabel : expandLabel}
                            onClick={() => onOpenChange(!isOpen)}
                        >
                            <ChevronDown
                                className={cn("size-4 transition-transform", isOpen ? "rotate-180" : "rotate-0")}
                                aria-hidden="true"
                            />
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent id={bodyId} hidden={!isOpen} className={cn("p-0", isOpen && "px-4 py-4")}>
                {isOpen ? children : null}
            </CardContent>
        </Card>
    );
}

/** Wrapper so consumers can render the grip-only target — used when they want the activator outside the header (rare). */
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
