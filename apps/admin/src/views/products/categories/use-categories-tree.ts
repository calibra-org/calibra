"use client";

import type { Locale } from "@calibra/shared/i18n";
import type { DragEndEvent, DragMoveEvent, DragStartEvent } from "@dnd-kit/core";
import { useCallback, useMemo, useState } from "react";

import type { AdminCategory } from "#/lib/types";

import { collectSubtreeIds, flattenCategoryTree, reparentCategory, resolveProjectedParent } from "./build-tree";
import { type CategoryTreeRow, type DropProjection, MAX_TREE_DEPTH, TREE_INDENT_PX } from "./types";

interface UseCategoriesTreeArgs {
    initialRows: AdminCategory[];
    locale: Locale;
}

interface CategoriesTreeApi {
    rows: AdminCategory[];
    flatRows: CategoryTreeRow[];
    /** Flat-row order while a drag is in flight, with the dragged subtree hidden. */
    flatRowsForDrag: CategoryTreeRow[];
    activeId: number | null;
    activeRow: CategoryTreeRow | null;
    overId: number | null;
    projection: DropProjection | null;
    expanded: Set<number>;
    toggleExpand: (id: number) => void;
    expandAll: () => void;
    collapseAll: () => void;
    isExpanded: (id: number) => boolean;
    upsert: (row: AdminCategory) => void;
    remove: (id: number) => void;
    onDragStart: (event: DragStartEvent) => void;
    onDragMove: (event: DragMoveEvent) => void;
    onDragEnd: (event: DragEndEvent) => void;
    onDragCancel: () => void;
    /** Replace the entire dataset (e.g. after refetch). Preserves expansion state. */
    setRows: (rows: AdminCategory[]) => void;
}

/**
 * Owns the categories tree state — the flat-list cache, expand/collapse, drag selection, and
 * the projected drop position. The render layer reads `flatRowsForDrag` while a drag is in
 * flight (the dragged subtree is hidden so it doesn't fight the cursor for vertical space)
 * and `flatRows` otherwise.
 *
 * Drag math follows the canonical dnd-kit Sortable Tree pattern: project a target depth from
 * the horizontal pointer offset, snap it to the deepest legal parent, and reject self-cycles
 * before committing the move.
 */
export function useCategoriesTree({ initialRows, locale }: UseCategoriesTreeArgs): CategoriesTreeApi {
    const [rows, setRows] = useState<AdminCategory[]>(initialRows);
    const [expanded, setExpanded] = useState<Set<number>>(() => topLevelIds(initialRows));
    const [activeId, setActiveId] = useState<number | null>(null);
    const [overId, setOverId] = useState<number | null>(null);
    const [offsetLeft, setOffsetLeft] = useState(0);

    const flatRows = useMemo(() => flattenCategoryTree(rows, expanded, locale), [rows, expanded, locale]);

    const movingSubtree = useMemo(() => (activeId === null ? null : collectSubtreeIds(rows, activeId)), [activeId, rows]);

    const flatRowsForDrag = useMemo(() => {
        if (movingSubtree === null) return flatRows;
        return flatRows.filter((row) => !movingSubtree.has(row.category.id));
    }, [flatRows, movingSubtree]);

    const activeRow = useMemo(
        () => (activeId === null ? null : (flatRows.find((row) => row.category.id === activeId) ?? null)),
        [activeId, flatRows],
    );

    const projection = useMemo<DropProjection | null>(() => {
        if (activeId === null || overId === null) return null;
        const overIndex = flatRowsForDrag.findIndex((row) => row.category.id === overId);
        if (overIndex === -1) return null;
        const overRow = flatRowsForDrag[overIndex];
        const previousRow = flatRowsForDrag[overIndex - 1];
        const dragOffsetDepth = Math.round(offsetLeft / TREE_INDENT_PX);

        const activeRowForProjection = flatRows.find((row) => row.category.id === activeId);
        const baseDepth = activeRowForProjection?.depth ?? overRow.depth;
        let projectedDepth = baseDepth + dragOffsetDepth;
        const minDepth = previousRow === undefined ? 0 : 0;
        const maxDepth = previousRow === undefined ? 0 : Math.min(previousRow.depth + 1, MAX_TREE_DEPTH);
        if (projectedDepth > maxDepth) projectedDepth = maxDepth;
        if (projectedDepth < minDepth) projectedDepth = minDepth;

        const { parentId, depth } = resolveProjectedParent(flatRowsForDrag, overIndex - 1, projectedDepth);

        /** Cycle-guard: never project a drop into the moving subtree. */
        if (movingSubtree !== null && parentId !== null && movingSubtree.has(parentId)) {
            return null;
        }
        return { parentId, depth, kind: dragOffsetDepth > 0 ? "inside" : "between" };
    }, [activeId, overId, offsetLeft, flatRowsForDrag, flatRows, movingSubtree]);

    const isExpanded = useCallback((id: number) => expanded.has(id), [expanded]);

    const toggleExpand = useCallback((id: number) => {
        setExpanded((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const expandAll = useCallback(() => {
        setExpanded(new Set(rows.map((r) => r.id)));
    }, [rows]);

    const collapseAll = useCallback(() => {
        setExpanded(new Set());
    }, []);

    const upsert = useCallback((row: AdminCategory) => {
        setRows((current) => {
            const idx = current.findIndex((r) => r.id === row.id);
            if (idx === -1) return [...current, row];
            const next = current.slice();
            next[idx] = row;
            return next;
        });
    }, []);

    const remove = useCallback((id: number) => {
        setRows((current) => current.filter((r) => r.id !== id));
    }, []);

    const onDragStart = useCallback((event: DragStartEvent) => {
        const id = Number(event.active.id);
        if (!Number.isFinite(id)) return;
        setActiveId(id);
        setOverId(id);
    }, []);

    const onDragMove = useCallback((event: DragMoveEvent) => {
        setOffsetLeft(event.delta.x);
        if (event.over !== null) {
            const id = Number(event.over.id);
            if (Number.isFinite(id)) setOverId(id);
        }
    }, []);

    const resetDrag = useCallback(() => {
        setActiveId(null);
        setOverId(null);
        setOffsetLeft(0);
    }, []);

    const onDragEnd = useCallback(
        (event: DragEndEvent) => {
            const draggedId = Number(event.active.id);
            const targetProjection = projection;
            resetDrag();
            if (!Number.isFinite(draggedId) || targetProjection === null) return;
            /**
             * TODO(api): no `PATCH /admin/categories/{id}` with `parent_id` change is wired yet.
             * Optimistically reparent on the client; once the move endpoint lands, fire a
             * mutation here and rollback if it rejects.
             */
            setRows((current) => reparentCategory(current, draggedId, targetProjection.parentId));
            if (targetProjection.parentId !== null) {
                setExpanded((current) => {
                    if (current.has(targetProjection.parentId as number)) return current;
                    const next = new Set(current);
                    next.add(targetProjection.parentId as number);
                    return next;
                });
            }
        },
        [projection, resetDrag],
    );

    const onDragCancel = useCallback(() => {
        resetDrag();
    }, [resetDrag]);

    return {
        rows,
        flatRows,
        flatRowsForDrag,
        activeId,
        activeRow,
        overId,
        projection,
        expanded,
        toggleExpand,
        expandAll,
        collapseAll,
        isExpanded,
        upsert,
        remove,
        onDragStart,
        onDragMove,
        onDragEnd,
        onDragCancel,
        setRows,
    };
}

/** Top-level category ids, used as the initial set of expanded nodes so depth-1 rows are visible. */
function topLevelIds(rows: AdminCategory[]): Set<number> {
    const ids = new Set<number>();
    for (const row of rows) if (row.parentId === null) ids.add(row.id);
    return ids;
}
