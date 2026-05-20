"use client";

import type { Locale } from "@calibra/shared/i18n";
import {
    closestCenter,
    DndContext,
    type DragEndEvent,
    type DragMoveEvent,
    type DragStartEvent,
    KeyboardSensor,
    MeasuringStrategy,
    PointerSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CornerDownRight, FolderTree, MoveVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { cn } from "#/lib/utils";

import { CategoryTreeRowView } from "./category-tree-row";
import type { CategoryTreeRow, DropProjection } from "./types";

interface CategoryTreeProps {
    flatRowsForDrag: CategoryTreeRow[];
    activeId: number | null;
    activeRow: CategoryTreeRow | null;
    overId: number | null;
    projection: DropProjection | null;
    activeProjectedDepth: number | null;
    selectedId: number | null;
    locale: Locale;
    onSelect: (id: number) => void;
    onToggleExpand: (id: number) => void;
    onAddChild: (parentId: number) => void;
    onDelete: (id: number) => void;
    onDragStart: (event: DragStartEvent) => void;
    onDragMove: (event: DragMoveEvent) => void;
    onDragEnd: (event: DragEndEvent) => void;
    onDragCancel: () => void;
}

/**
 * Sortable category tree. Drives a single flat `SortableContext` over the visible rows — the
 * indentation is purely visual, so dnd-kit's stock vertical strategy suffices. The active row
 * stays inside the list (dimmed); dnd-kit animates siblings out of the way as the cursor
 * moves. Reparenting is conveyed through (a) the projected indent applied to the active row,
 * (b) the highlighted drop-parent row, and (c) the floating caption above the cursor.
 */
export function CategoryTree({
    flatRowsForDrag,
    activeId,
    activeRow,
    overId,
    projection,
    activeProjectedDepth,
    selectedId,
    locale,
    onSelect,
    onToggleExpand,
    onAddChild,
    onDelete,
    onDragStart,
    onDragMove,
    onDragEnd,
    onDragCancel,
}: CategoryTreeProps) {
    const t = useTranslations("Categories");
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const items = useMemo(() => flatRowsForDrag.map((row) => row.category.id), [flatRowsForDrag]);

    const dropParentName = useMemo(() => {
        if (projection === null || projection.parentId === null) return null;
        const parentRow = flatRowsForDrag.find((row) => row.category.id === projection.parentId);
        return parentRow?.category.name[locale] ?? null;
    }, [projection, flatRowsForDrag, locale]);

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            onDragCancel={onDragCancel}
        >
            <SortableContext items={items} strategy={verticalListSortingStrategy}>
                <div role="tree" aria-label={t("tree.label")} className="flex flex-col gap-0.5">
                    {flatRowsForDrag.map((row) => {
                        const isActive = activeId === row.category.id;
                        const isDropParent =
                            projection?.kind === "inside" && projection.parentId === row.category.id && activeId !== null;
                        const overrideDepth = isActive ? activeProjectedDepth : null;
                        return (
                            <CategoryTreeRowView
                                key={row.category.id}
                                row={row}
                                locale={locale}
                                isSelected={selectedId === row.category.id}
                                isActive={isActive}
                                isDropParent={isDropParent}
                                overrideDepth={overrideDepth}
                                onSelect={onSelect}
                                onToggleExpand={onToggleExpand}
                                onAddChild={onAddChild}
                                onDelete={onDelete}
                            />
                        );
                    })}
                </div>
            </SortableContext>

            {activeRow !== null && projection !== null && overId !== null && (
                <DropCaption
                    kind={projection.kind}
                    activeName={activeRow.category.name[locale] || t("untitled")}
                    targetName={dropParentName}
                    label={
                        projection.kind === "inside"
                            ? dropParentName !== null
                                ? t("dropCaption.inside", { name: dropParentName })
                                : t("dropCaption.top")
                            : t("dropCaption.reorder")
                    }
                />
            )}
        </DndContext>
    );
}

interface DropCaptionProps {
    kind: "inside" | "reorder";
    activeName: string;
    targetName: string | null;
    label: string;
}

/**
 * Floating live-region caption that confirms what the next drop will do. Positioned bottom-
 * center over the page so it stays out of the way of the cursor while remaining readable, and
 * uses semantic icons so the intent is obvious before reading the label.
 */
function DropCaption({ kind, label }: DropCaptionProps) {
    return (
        <div
            aria-live="polite"
            aria-hidden={false}
            className={cn(
                "pointer-events-none fixed start-1/2 bottom-6 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-3 py-1.5 font-medium text-background text-xs shadow-lg",
                "rtl:translate-x-1/2",
            )}
        >
            {kind === "inside" ? (
                <CornerDownRight className="size-3.5" aria-hidden="true" />
            ) : (
                <MoveVertical className="size-3.5" aria-hidden="true" />
            )}
            <span>{label}</span>
            <FolderTree className="size-3.5 opacity-60" aria-hidden="true" />
        </div>
    );
}
