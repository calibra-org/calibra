"use client";

import {
    closestCenter,
    DndContext,
    type DragEndEvent,
    PointerSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import { arrayMove, horizontalListSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties } from "react";

import { Button } from "#/components/ui/button";
import { toast } from "#/components/ui/toast";
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

    const allIds = (terms.data ?? []).map((term) => term.id);
    const selectAll = () => onChange(allIds);
    const selectNone = () => onChange([]);

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
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={termIds} strategy={horizontalListSortingStrategy}>
                    <div className="flex flex-wrap items-center gap-1.5">
                        {(terms.data ?? []).map((term) => {
                            const active = termIds.includes(term.id);
                            return (
                                <TermChip
                                    key={term.id}
                                    id={term.id}
                                    active={active}
                                    sortable={active}
                                    label={term.name}
                                    onClick={() => toggle(term.id)}
                                />
                            );
                        })}
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
                </SortableContext>
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

function TermChip({ id, active, sortable, label, onClick }: TermChipProps) {
    const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
        id,
        disabled: !sortable,
    });
    const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition };
    return (
        <button
            ref={setNodeRef}
            style={style}
            type="button"
            onClick={onClick}
            {...attributes}
            {...(sortable ? listeners : {})}
            className={cn(
                "rounded-md border px-2 py-0.5 text-xs transition-colors",
                active
                    ? "border-primary/50 bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:border-ring/40",
                sortable && "cursor-grab active:cursor-grabbing",
                isDragging && "opacity-70 ring-2 ring-primary/40",
            )}
        >
            {label}
        </button>
    );
}
