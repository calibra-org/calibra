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
    PointerSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ArrowDownToLine, ArrowUpToLine, CornerDownRight, FolderTree } from "lucide-react";
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

    const dropTargetName = useMemo(() => {
        if (projection === null) return null;
        const targetRow = flatRowsForDrag.find((row) => row.category.id === projection.targetId);
        return targetRow?.category.name[locale] ?? null;
    }, [projection, flatRowsForDrag, locale]);

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            onDragCancel={onDragCancel}
        >
            <SortableContext items={items} strategy={verticalListSortingStrategy}>
                <div role="tree" aria-label={t("tree.label")} className="flex flex-col gap-0.5">
                    {flatRowsForDrag.map((row, index) => {
                        const isActive = activeId === row.category.id;
                        const overrideDepth = isActive ? activeProjectedDepth : null;
                        return (
                            <CategoryTreeRowView
                                key={row.category.id}
                                row={row}
                                locale={locale}
                                isSelected={selectedId === row.category.id}
                                isActive={isActive}
                                isFirst={index === 0}
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

            <DragOverlay dropAnimation={null}>
                {activeRow !== null ? (
                    <DragGhost
                        row={activeRow}
                        projection={projection}
                        dropParentName={dropParentName}
                        dropTargetName={dropTargetName}
                        locale={locale}
                        t={t}
                    />
                ) : null}
            </DragOverlay>
        </DndContext>
    );
}

interface DragGhostProps {
    row: CategoryTreeRow;
    projection: DropProjection | null;
    dropParentName: string | null;
    dropTargetName: string | null;
    locale: Locale;
    t: ReturnType<typeof useTranslations<"Categories">>;
}

/**
 * Floating card that follows the cursor while a drag is in flight. The badge beneath the card
 * spells out the next action ("Place above X" / "Place below X" / "Nest under X") so the
 * operator never has to scan the page to learn what release will do.
 */
function DragGhost({ row, projection, dropParentName, dropTargetName, locale, t }: DragGhostProps) {
    const kind = projection?.kind ?? null;
    const captionLabel =
        kind === "inside"
            ? dropParentName !== null
                ? t("dropCaption.inside", { name: dropParentName })
                : t("dropCaption.dragHint")
            : kind === "above" && dropTargetName !== null
              ? t("dropCaption.above", { name: dropTargetName })
              : kind === "below" && dropTargetName !== null
                ? t("dropCaption.below", { name: dropTargetName })
                : t("dropCaption.dragHint");

    return (
        <div className="pointer-events-none flex w-fit max-w-md flex-col items-start gap-2">
            <div
                className={cn(
                    "flex h-12 min-w-72 items-center gap-2 rounded-xl border bg-card px-3 shadow-foreground/10 shadow-xl ring-1 ring-black/5",
                    kind === "inside" && "border-primary/60",
                    kind === null && "border-border",
                    (kind === "above" || kind === "below") && "border-foreground/20",
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
                    kind === "inside" && "bg-primary text-primary-foreground",
                    (kind === "above" || kind === "below") && "bg-foreground text-background",
                    kind === null && "bg-muted-foreground text-background",
                )}
            >
                {kind === "inside" ? (
                    <CornerDownRight className="size-3.5" data-rtl-flip aria-hidden="true" />
                ) : kind === "above" ? (
                    <ArrowUpToLine className="size-3.5" aria-hidden="true" />
                ) : kind === "below" ? (
                    <ArrowDownToLine className="size-3.5" aria-hidden="true" />
                ) : (
                    <FolderTree className="size-3.5" aria-hidden="true" />
                )}
                <span>{captionLabel}</span>
            </div>
        </div>
    );
}
