"use client";

import type { DragEndEvent, DragMoveEvent, DragStartEvent } from "@dnd-kit/core";
import { useCallback, useMemo, useState } from "react";

import type { AdminCategory } from "#/lib/types";

import { collectSubtreeIds, flattenCategoryTree, moveCategory, projectDrop, sortIntoDfsOrder } from "./build-tree";
import { type CategoryTreeRow, type DropProjection, TREE_INDENT_PX } from "./types";

interface UseCategoriesTreeArgs {
    initialRows: AdminCategory[];
}

interface CategoriesTreeApi {
    rows: AdminCategory[];
    flatRows: CategoryTreeRow[];
    /** Flat-row order while a drag is in flight, with the active subtree's descendants hidden. */
    flatRowsForDrag: CategoryTreeRow[];
    activeId: number | null;
    activeRow: CategoryTreeRow | null;
    overId: number | null;
    projection: DropProjection | null;
    /** Active row's projected depth — fed back to the row renderer so its indent tracks the cursor. */
    activeProjectedDepth: number | null;
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
    setRows: (rows: AdminCategory[]) => void;
}

/**
 * Owns the categories tree state — the flat-list cache, expand/collapse, drag selection, and
 * the projected drop position. Implements the canonical dnd-kit Sortable Tree drop math
 * (see {@link projectDrop}) so reorders and reparents share one code path.
 *
 * Persistence is local-only for now (no PATCH endpoint); the drag controller commits to the
 * client state via {@link moveCategory} and emits a TODO so future work can swap in a server
 * mutation. The renderer reads `activeProjectedDepth` so the active row's indent animates as
 * the cursor moves horizontally — without that feedback, "drag right to nest" feels broken.
 */
export function useCategoriesTree({ initialRows }: UseCategoriesTreeArgs): CategoriesTreeApi {
    const [rows, setRows] = useState<AdminCategory[]>(() => sortIntoDfsOrder(initialRows));
    const [expanded, setExpanded] = useState<Set<number>>(() => topLevelIds(initialRows));
    const [activeId, setActiveId] = useState<number | null>(null);
    const [overId, setOverId] = useState<number | null>(null);
    const [offsetLeft, setOffsetLeft] = useState(0);

    const flatRows = useMemo(() => flattenCategoryTree(rows, expanded), [rows, expanded]);

    const movingSubtree = useMemo(() => (activeId === null ? null : collectSubtreeIds(rows, activeId)), [activeId, rows]);

    /**
     * Active row stays visible (dimmed) so siblings can animate around it via `useSortable`'s
     * transform; only its descendants are hidden — they'd otherwise fight the cursor for
     * vertical space while their parent moves.
     */
    const flatRowsForDrag = useMemo(() => {
        if (movingSubtree === null) return flatRows;
        return flatRows.filter((row) => row.category.id === activeId || !movingSubtree.has(row.category.id));
    }, [flatRows, movingSubtree, activeId]);

    const activeRow = useMemo(
        () => (activeId === null ? null : (flatRows.find((row) => row.category.id === activeId) ?? null)),
        [activeId, flatRows],
    );

    const dropResult = useMemo(() => {
        if (activeId === null || overId === null || movingSubtree === null) return null;
        return projectDrop({
            flatRows: flatRowsForDrag,
            activeId,
            overId,
            dragOffsetX: offsetLeft,
            indentPx: TREE_INDENT_PX,
            movingSubtree,
        });
    }, [activeId, overId, offsetLeft, flatRowsForDrag, movingSubtree]);

    const projection = useMemo<DropProjection | null>(() => {
        if (dropResult === null) return null;
        const sameParentAsActive = activeRow !== null && activeRow.category.parentId === dropResult.parentId;
        return {
            parentId: dropResult.parentId,
            depth: dropResult.depth,
            kind: sameParentAsActive ? "reorder" : "inside",
        };
    }, [dropResult, activeRow]);

    const activeProjectedDepth = dropResult?.depth ?? null;

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
        setOffsetLeft(0);
        if (typeof document !== "undefined") {
            document.body.style.cursor = "grabbing";
        }
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
        if (typeof document !== "undefined") {
            document.body.style.cursor = "";
        }
    }, []);

    const onDragEnd = useCallback(
        (event: DragEndEvent) => {
            const draggedId = Number(event.active.id);
            const overTargetId = event.over === null ? null : Number(event.over.id);
            const result = dropResult;
            resetDrag();
            if (!Number.isFinite(draggedId) || overTargetId === null || !Number.isFinite(overTargetId) || result === null) {
                return;
            }
            /**
             * TODO(api): no `PATCH /admin/categories/{id}` with parent / order change is wired
             * yet. Optimistically rearrange on the client; once the move endpoint lands, fire a
             * mutation here and roll back the local state if the server rejects.
             */
            setRows((current) => moveCategory(current, draggedId, overTargetId, result.parentId));
            if (result.parentId !== null) {
                setExpanded((current) => {
                    if (current.has(result.parentId as number)) return current;
                    const next = new Set(current);
                    next.add(result.parentId as number);
                    return next;
                });
            }
        },
        [dropResult, resetDrag],
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
        activeProjectedDepth,
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

/** Top-level category ids — initial expanded set so depth-1 children are visible on first paint. */
function topLevelIds(rows: AdminCategory[]): Set<number> {
    const ids = new Set<number>();
    for (const row of rows) if (row.parentId === null) ids.add(row.id);
    return ids;
}
