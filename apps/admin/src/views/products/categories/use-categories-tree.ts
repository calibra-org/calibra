"use client";

import type { DragEndEvent, DragMoveEvent, DragStartEvent } from "@dnd-kit/core";
import { useCallback, useEffect, useMemo, useState } from "react";

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
 * the projected drop position. Drop semantics follow the cursor-Y-zone pattern (see
 * {@link projectDrop}): top quarter of a row = drop above, bottom quarter = drop below, middle
 * half = nest inside. Predictable, jitter-free, and matches the convention every operator has
 * internalised from desktop file managers.
 *
 * Persistence is local-only for now (no PATCH endpoint); the drag controller commits to the
 * client state via {@link moveCategory} and emits a TODO so future work can swap in a server
 * mutation.
 */
export function useCategoriesTree({ initialRows }: UseCategoriesTreeArgs): CategoriesTreeApi {
    const [rows, setRows] = useState<AdminCategory[]>(() => sortIntoDfsOrder(initialRows));
    const [expanded, setExpanded] = useState<Set<number>>(() => topLevelIds(initialRows));
    const [activeId, setActiveId] = useState<number | null>(null);
    const [overId, setOverId] = useState<number | null>(null);
    const [overRect, setOverRect] = useState<{ top: number; height: number } | null>(null);
    const [pointerY, setPointerY] = useState<number | null>(null);

    /**
     * Track raw pointer Y throughout the drag. dnd-kit gives us `event.delta` but the cursor's
     * absolute viewport position is what determines which zone of the over row it sits in — a
     * single `pointermove` listener is cheaper than reading `activatorEvent` + summing deltas
     * on every render.
     */
    useEffect(() => {
        if (activeId === null) {
            setPointerY(null);
            return;
        }
        const handler = (event: PointerEvent) => setPointerY(event.clientY);
        window.addEventListener("pointermove", handler);
        return () => window.removeEventListener("pointermove", handler);
    }, [activeId]);

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

    const projection = useMemo<DropProjection | null>(() => {
        if (activeId === null || overId === null || overRect === null || pointerY === null || movingSubtree === null) return null;
        const positionInRow = (pointerY - overRect.top) / overRect.height;
        return projectDrop({
            flatRows: flatRowsForDrag,
            activeId,
            overId,
            positionInRow,
            movingSubtree,
        });
    }, [activeId, overId, overRect, pointerY, flatRowsForDrag, movingSubtree]);

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
        setOverId(id);
        if (typeof document !== "undefined") {
            document.body.style.cursor = "grabbing";
        }
    }, []);

    const onDragMove = useCallback((event: DragMoveEvent) => {
        if (event.over !== null) {
            const id = Number(event.over.id);
            if (Number.isFinite(id)) {
                setOverId(id);
                const rect = event.over.rect;
                setOverRect({ top: rect.top, height: rect.height });
            }
        }
    }, []);

    const resetDrag = useCallback(() => {
        setActiveId(null);
        setOverId(null);
        setOverRect(null);
        setPointerY(null);
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
