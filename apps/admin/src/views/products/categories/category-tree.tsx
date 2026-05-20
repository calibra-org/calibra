"use client";

import type { Locale } from "@calibra/shared/i18n";
import {
    closestCenter,
    DndContext,
    type DragEndEvent,
    type DragMoveEvent,
    DragOverlay,
    type DragStartEvent,
    KeyboardSensor,
    MeasuringStrategy,
    PointerSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { FolderTree } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "#/components/ui/badge";
import { formatNumber } from "#/lib/format";
import { cn } from "#/lib/utils";

import { CategoryTreeRowView } from "./category-tree-row";
import type { CategoryTreeRow, DropProjection } from "./types";

interface CategoryTreeProps {
    flatRowsForDrag: CategoryTreeRow[];
    activeId: number | null;
    activeRow: CategoryTreeRow | null;
    overId: number | null;
    projection: DropProjection | null;
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
 * indentation is purely visual, so dnd-kit's stock vertical strategy is enough. Reparenting is
 * resolved by the parent hook from the cursor's horizontal offset; this component just shows
 * the result and renders an overlay for the dragged row so the cursor follows a clean preview.
 */
export function CategoryTree({
    flatRowsForDrag,
    activeId,
    activeRow,
    overId,
    projection,
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
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const items = flatRowsForDrag.map((row) => row.category.id);

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
            modifiers={[restrictToVerticalAxis]}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            onDragCancel={onDragCancel}
        >
            <SortableContext items={items} strategy={verticalListSortingStrategy}>
                <div role="tree" aria-label={t("tree.label")} className="flex flex-col gap-0.5">
                    {flatRowsForDrag.map((row) => {
                        const isOver = overId === row.category.id && activeId !== row.category.id;
                        const isDropInside = isOver && projection?.kind === "inside";
                        const projectedDepth = isOver && projection !== null ? projection.depth : null;
                        return (
                            <CategoryTreeRowView
                                key={row.category.id}
                                row={row}
                                locale={locale}
                                isSelected={selectedId === row.category.id}
                                isDragging={activeId === row.category.id}
                                isDropTarget={isDropInside}
                                projectedDepth={projectedDepth}
                                onSelect={onSelect}
                                onToggleExpand={onToggleExpand}
                                onAddChild={onAddChild}
                                onDelete={onDelete}
                            />
                        );
                    })}
                </div>
            </SortableContext>

            <DragOverlay dropAnimation={null}>
                {activeRow !== null ? (
                    <div className="pointer-events-none flex h-12 max-w-md items-center gap-2 rounded-lg border border-primary/40 bg-card px-3 shadow-lg shadow-primary/10 ring-2 ring-primary/20">
                        <FolderTree className="size-4 text-primary" aria-hidden="true" />
                        <span className="truncate font-medium text-sm">{activeRow.category.name[locale] || t("untitled")}</span>
                        <Badge variant="secondary" className="ms-auto tabular-nums">
                            {formatNumber(activeRow.category.productCount, locale)}
                        </Badge>
                    </div>
                ) : null}
            </DragOverlay>

            {activeId !== null && projection !== null && projection.parentId !== null && (
                <span
                    aria-hidden="true"
                    className={cn(
                        "pointer-events-none fixed start-1/2 bottom-6 z-50 -translate-x-1/2 rounded-full bg-primary px-3 py-1 font-medium text-primary-foreground text-xs shadow-lg",
                        "rtl:translate-x-1/2",
                    )}
                >
                    {t("dropAsChild")}
                </span>
            )}
        </DndContext>
    );
}
