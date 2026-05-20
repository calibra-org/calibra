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
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ArrowUpToLine, CornerDownRight, FolderTree, MoveVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { Badge } from "#/components/ui/badge";
import { cn } from "#/lib/utils";

import { CategoryTreeRowView } from "./category-tree-row";
import type { CategoryTreeRow, DropProjection } from "./types";

interface CategoryTreeProps {
    flatRowsForDrag: CategoryTreeRow[];
    activeId: number | null;
    activeRow: CategoryTreeRow | null;
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
 * Sortable category tree.
 *
 * Render model during a drag:
 *
 *   - The in-list row at the active position is rendered as a dashed "destination outline" —
 *     it animates indent to match the projected depth, telling the user where the row will
 *     land if released.
 *   - A solid {@link DragOverlay} clone of the row follows the cursor, with the live drop
 *     caption ("Nest under X" / "Reorder" / "Move to top level") pinned to its underside.
 *   - The projected parent row (if any) gains a strong primary tint, an accent bar on the
 *     start side, and a soft glow — the connection between active row and new parent reads
 *     at a glance, instead of being scattered across the page.
 */
export function CategoryTree({
    flatRowsForDrag,
    activeId,
    activeRow,
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
                            projection?.kind === "nest" && projection.parentId === row.category.id && activeId !== null;
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
                                nestingParentName={isActive && projection?.kind === "nest" ? dropParentName : null}
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
                    <DragGhost row={activeRow} projection={projection} dropParentName={dropParentName} locale={locale} t={t} />
                ) : null}
            </DragOverlay>
        </DndContext>
    );
}

interface DragGhostProps {
    row: CategoryTreeRow;
    projection: DropProjection | null;
    dropParentName: string | null;
    locale: Locale;
    t: ReturnType<typeof useTranslations<"Categories">>;
}

/**
 * Floating card that follows the cursor while a drag is in flight. Doubles as the live drop
 * caption — the badge beneath the card spells out the next action so the operator never has to
 * scan the page to learn what release will do.
 */
function DragGhost({ row, projection, dropParentName, locale, t }: DragGhostProps) {
    const kind = projection?.kind ?? "reorder";
    const captionLabel =
        kind === "nest"
            ? dropParentName !== null
                ? t("dropCaption.inside", { name: dropParentName })
                : t("dropCaption.reorder")
            : kind === "promote"
              ? t("dropCaption.top")
              : t("dropCaption.reorder");

    return (
        <div className="pointer-events-none flex w-fit max-w-md flex-col items-start gap-2">
            <div
                className={cn(
                    "flex h-12 min-w-72 items-center gap-2 rounded-xl border bg-card px-3 shadow-foreground/10 shadow-xl ring-1 ring-black/5",
                    kind === "nest" && "border-primary/60",
                    kind === "promote" && "border-foreground/20",
                    kind === "reorder" && "border-border",
                )}
            >
                <FolderTree className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate font-medium text-foreground text-sm">{row.category.name[locale] || t("untitled")}</span>
                <Badge variant="secondary" className="ms-auto tabular-nums">
                    {row.category.productCount}
                </Badge>
            </div>
            <div
                className={cn(
                    "flex items-center gap-2 rounded-full px-3 py-1 font-medium text-xs shadow-md",
                    kind === "nest" && "bg-primary text-primary-foreground",
                    kind === "promote" && "bg-foreground text-background",
                    kind === "reorder" && "bg-muted-foreground text-background",
                )}
            >
                {kind === "nest" ? (
                    <CornerDownRight className="size-3.5" aria-hidden="true" />
                ) : kind === "promote" ? (
                    <ArrowUpToLine className="size-3.5" aria-hidden="true" />
                ) : (
                    <MoveVertical className="size-3.5" aria-hidden="true" />
                )}
                <span>{captionLabel}</span>
            </div>
        </div>
    );
}
