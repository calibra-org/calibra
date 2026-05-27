"use client";

import { closestCenter, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties } from "react";

import { Button } from "#/components/ui/button";
import { toast } from "#/components/ui/toast";
import { GripVertical } from "#/icons";
import { useCreateAttributeTerm } from "#/lib/products/mutations";
import { useGlobalAttributeTerms } from "#/lib/products/queries";
import { cn } from "#/lib/utils";

import { InlineTermCreator } from "./inline-term-creator";

interface TermChipStripProps {
    attributeId: number;
    termIds: number[];
    onChange: (next: number[]) => void;
    labels: {
        values: string;
        selectAll: string;
        selectNone: string;
        createValue: string;
        createFailed: string;
    };
}

/**
 * Sortable horizontal chip strip for a global attribute's term selection. Active chips reorder
 * via dnd-kit's horizontal strategy — `term_ids` order powers the variations cartesian, so the
 * operator controls the combination order through this widget. Inactive chips remain click-to-
 * toggle. Inline term creation posts to the attribute and appends the new id pre-selected.
 */
export function TermChipStrip({ attributeId, termIds, onChange, labels }: TermChipStripProps) {
    const terms = useGlobalAttributeTerms(attributeId);
    const createTerm = useCreateAttributeTerm(attributeId);

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over === null || active.id === over.id) return;
        const oldIndex = termIds.indexOf(Number(active.id));
        const newIndex = termIds.indexOf(Number(over.id));
        if (oldIndex === -1 || newIndex === -1) return;
        onChange(arrayMove(termIds, oldIndex, newIndex));
    };

    const toggle = (termId: number) => {
        onChange(termIds.includes(termId) ? termIds.filter((id) => id !== termId) : [...termIds, termId]);
    };

    const all = terms.data ?? [];
    const allIds = all.map((term) => term.id);
    const selectAll = () => onChange(allIds);
    const selectNone = () => onChange([]);

    /**
     * Active chips render FIRST in `termIds` order so dnd-kit's drop-position math (which reads
     * the live DOM rect of each sortable item) matches the operator's chosen ordering. If we
     * intermixed active + inactive in taxonomy order, the SortableContext index would diverge
     * from the rendered DOM index and drags would land in surprising slots. Inactive chips
     * render after a thin divider so the operator can scan "what's chosen vs. available" at a
     * glance — and so they don't accidentally drop an active chip on an inactive one.
     */
    const termById = new Map(all.map((t) => [t.id, t]));
    const activeTerms = termIds.map((id) => termById.get(id)).filter((t): t is { id: number; name: string } => t !== undefined);
    const inactiveTerms = all.filter((t) => !termIds.includes(t.id));

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <span>{labels.values}</span>
                <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={selectAll}>
                    {labels.selectAll}
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={selectNone}>
                    {labels.selectNone}
                </Button>
            </div>
            <DndContext
                id={`term-chips-${attributeId}`}
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <div className="flex flex-wrap items-center gap-1.5">
                    <SortableContext items={termIds} strategy={rectSortingStrategy}>
                        {activeTerms.map((term) => (
                            <TermChip
                                key={term.id}
                                id={term.id}
                                active
                                sortable
                                label={term.name}
                                onClick={() => toggle(term.id)}
                            />
                        ))}
                    </SortableContext>
                    {activeTerms.length > 0 && inactiveTerms.length > 0 ? (
                        <span className="h-5 w-px bg-border" aria-hidden="true" />
                    ) : null}
                    {inactiveTerms.map((term) => (
                        <TermChip
                            key={term.id}
                            id={term.id}
                            active={false}
                            sortable={false}
                            label={term.name}
                            onClick={() => toggle(term.id)}
                        />
                    ))}
                    <InlineTermCreator
                        placeholder={labels.createValue}
                        busy={createTerm.isPending}
                        onCreate={async (name) => {
                            try {
                                const result = await createTerm.mutateAsync({ name });
                                onChange([...termIds, result.data.id]);
                            } catch (error) {
                                toast.add({
                                    title: labels.createFailed,
                                    description: String(error),
                                    data: { tone: "error" },
                                });
                            }
                        }}
                    />
                </div>
            </DndContext>
        </div>
    );
}

interface TermChipProps {
    id: number;
    active: boolean;
    sortable: boolean;
    label: string;
    onClick: () => void;
}

/**
 * Active chips get a separate grip dot so click-to-deselect and drag-to-reorder don't compete
 * over the same pointer gesture. dnd-kit's setNodeRef + attributes ride on the outer `<div>`
 * (which is not interactive), the grip `<button>` carries the listeners, and the label
 * `<button>` is click-only. Inactive chips skip the grip entirely — they're not in the
 * ordered list yet, so there's nothing to drag.
 */
function TermChip({ id, active, sortable, label, onClick }: TermChipProps) {
    const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
        id,
        disabled: !sortable,
    });
    const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition };

    if (!active) {
        return (
            <button
                ref={setNodeRef}
                style={style}
                type="button"
                onClick={onClick}
                {...attributes}
                className="rounded-md border border-border px-2 py-0.5 text-muted-foreground text-xs transition-colors hover:border-ring/40"
            >
                {label}
            </button>
        );
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            className={cn(
                "inline-flex items-center overflow-hidden rounded-md border border-primary/50 bg-primary/10 text-xs transition-colors",
                isDragging && "opacity-70 ring-2 ring-primary/40",
            )}
        >
            <button
                type="button"
                {...(sortable ? listeners : {})}
                aria-label="reorder"
                className={cn(
                    "flex items-center justify-center self-stretch border-primary/30 border-e px-1 text-muted-foreground/70 transition-colors",
                    "hover:bg-primary/20 hover:text-foreground active:cursor-grabbing",
                    sortable && "cursor-grab",
                )}
            >
                <GripVertical className="size-3" aria-hidden="true" />
            </button>
            <button type="button" onClick={onClick} className="px-2 py-0.5 text-foreground transition-colors hover:bg-primary/20">
                {label}
            </button>
        </div>
    );
}
