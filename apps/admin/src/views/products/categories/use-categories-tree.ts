"use client";

import type { DragEndEvent, DragMoveEvent, DragStartEvent } from "@dnd-kit/core";
import { useCallback, useMemo, useState } from "react";

import type { AdminCategory } from "#/lib/types";

import { collectSubtreeIds, flattenCategoryTree, moveCategory, projectDrop, sortIntoDfsOrder } from "./build-tree";
import type { CategoryTreeRow, DropProjection } from "./types";

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
 * the projected drop position. Drop semantics follow the cursor-Y-zone pattern (see
 * {@link projectDrop}): top quarter of a row = drop above, bottom quarter = drop below, middle
 * half = nest inside.
 *
 * Performance note: the projection is computed inside `onDragMove` and stored as a single piece
 * of state with a structural equality check, so React only re-renders when the projection
 * actually changes between frames. Earlier iterations tracked raw pointer Y in state via a
 * global `pointermove` listener, which fired ~120 Hz and produced enough state churn to trip
 * React's max-update-depth guard during long drags.
 */
export function useCategoriesTree({ initialRows }: UseCategoriesTreeArgs): CategoriesTreeApi {
    const [rows, setRows] = useState<AdminCategory[]>(() => sortIntoDfsOrder(initialRows));
    const [expanded, setExpanded] = useState<Set<number>>(() => topLevelIds(initialRows));
    const [activeId, setActiveId] = useState<number | null>(null);
    const [projection, setProjection] = useState<DropProjection | null>(null);

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

    const activeProjectedDepth = projection?.depth ?? null;

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
        setProjection(null);
        if (typeof document !== "undefined") {
            document.body.style.cursor = "grabbing";
        }
    }, []);

    const onDragMove = useCallback(
        (event: DragMoveEvent) => {
            if (event.over === null || activeId === null || movingSubtree === null) return;
            const activator = event.activatorEvent as PointerEvent;
            if (typeof activator.clientY !== "number") return;
            const pointerY = activator.clientY + event.delta.y;
            const rect = event.over.rect;
            const positionInRow = (pointerY - rect.top) / rect.height;
            const overId = Number(event.over.id);
            if (!Number.isFinite(overId)) return;
            const next = projectDrop({
                flatRows: flatRowsForDrag,
                activeId,
                overId,
                positionInRow,
                movingSubtree,
            });
            setProjection((prev) => (projectionsEqual(prev, next) ? prev : next));
        },
        [activeId, movingSubtree, flatRowsForDrag],
    );

    const resetDrag = useCallback(() => {
        setActiveId(null);
        setProjection(null);
        if (typeof document !== "undefined") {
            document.body.style.cursor = "";
        }
    }, []);

    const onDragEnd = useCallback(
        (event: DragEndEvent) => {
            const draggedId = Number(event.active.id);
            const proj = projection;
            resetDrag();
            if (!Number.isFinite(draggedId) || proj === null) return;
            /**
             * TODO(api): no `PATCH /admin/categories/{id}` with parent / order change is wired
             * yet. Optimistically rearrange on the client; once the move endpoint lands, fire a
             * mutation here and roll back the local state if the server rejects.
             */
            setRows((current) => moveCategory(current, draggedId, proj.targetId, proj.kind, proj.parentId));
            if (proj.kind === "inside") {
                setExpanded((current) => {
                    if (current.has(proj.targetId)) return current;
                    const next = new Set(current);
                    next.add(proj.targetId);
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

/**
 * Structural compare for {@link DropProjection}. Two projections are equal when they share the
 * same `kind`, `targetId`, `parentId`, and `depth` — that's the entire surface the renderer
 * reads, so a stable reference here means React can skip the cascade of useMemos / context
 * updates downstream and keep the drag responsive at 120 Hz.
 */
function projectionsEqual(a: DropProjection | null, b: DropProjection | null): boolean {
    if (a === b) return true;
    if (a === null || b === null) return false;
    return a.kind === b.kind && a.targetId === b.targetId && a.parentId === b.parentId && a.depth === b.depth;
}
