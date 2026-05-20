import { arrayMove } from "@dnd-kit/sortable";

import type { AdminCategory } from "#/lib/types";

import { type CategoryTreeRow, MAX_TREE_DEPTH } from "./types";

/**
 * Source-of-truth ordering for the categories list. Sibling rank is encoded by array order — the
 * drag controller calls {@link moveCategory} with `arrayMove` semantics, and the renderer walks
 * the array in document order when emitting the flat tree. Initial fetches come back in API
 * order (typically by id); {@link sortIntoDfsOrder} once at boot keeps the rows in DFS pre-order
 * so the drag math has a stable index space.
 */
export function sortIntoDfsOrder(rows: AdminCategory[]): AdminCategory[] {
    const byParent = new Map<number | null, AdminCategory[]>();
    for (const row of rows) {
        const bucket = byParent.get(row.parentId) ?? [];
        bucket.push(row);
        byParent.set(row.parentId, bucket);
    }
    const out: AdminCategory[] = [];
    const walk = (parentId: number | null) => {
        const bucket = byParent.get(parentId) ?? [];
        for (const child of bucket) {
            out.push(child);
            walk(child.id);
        }
    };
    walk(null);
    return out;
}

/**
 * Build a depth-aware ordered list from the flat category source. Siblings appear in the order
 * they live in `rows` — no implicit alpha sort, because operators expect their drag-to-reorder
 * commits to stick. Subtrees of collapsed parents are skipped (pass `expandedIds = null` to
 * force every node visible, e.g. for the parent-picker dropdown).
 */
export function flattenCategoryTree(rows: AdminCategory[], expandedIds: ReadonlySet<number> | null): CategoryTreeRow[] {
    const byParent = new Map<number | null, AdminCategory[]>();
    for (const row of rows) {
        const bucket = byParent.get(row.parentId) ?? [];
        bucket.push(row);
        byParent.set(row.parentId, bucket);
    }

    const descendantCount = countDescendants(byParent);
    const out: CategoryTreeRow[] = [];

    const walk = (parentId: number | null, depth: number, chain: number[]) => {
        const children = byParent.get(parentId) ?? [];
        for (const child of children) {
            const grandchildren = byParent.get(child.id) ?? [];
            const expanded = expandedIds === null ? true : expandedIds.has(child.id);
            out.push({
                category: child,
                depth,
                parentChain: chain,
                hasChildren: grandchildren.length > 0,
                descendantCount: descendantCount.get(child.id) ?? 0,
                isExpanded: expanded,
            });
            if (expanded && grandchildren.length > 0) {
                walk(child.id, depth + 1, [...chain, child.id]);
            }
        }
    };

    walk(null, 0, []);
    return out;
}

function countDescendants(byParent: Map<number | null, AdminCategory[]>): Map<number, number> {
    const cache = new Map<number, number>();
    const count = (id: number): number => {
        const cached = cache.get(id);
        if (cached !== undefined) return cached;
        const kids = byParent.get(id) ?? [];
        let total = kids.length;
        for (const kid of kids) total += count(kid.id);
        cache.set(id, total);
        return total;
    };
    for (const bucket of byParent.values()) {
        for (const row of bucket) count(row.id);
    }
    return cache;
}

/**
 * IDs of `nodeId` and every descendant. Used by the drag controller to (a) hide the moving
 * subtree's descendants while dragging, and (b) reject self-parent / cycle drops.
 */
export function collectSubtreeIds(rows: AdminCategory[], nodeId: number): Set<number> {
    const byParent = new Map<number | null, AdminCategory[]>();
    for (const row of rows) {
        const bucket = byParent.get(row.parentId) ?? [];
        bucket.push(row);
        byParent.set(row.parentId, bucket);
    }
    const out = new Set<number>([nodeId]);
    const stack = [nodeId];
    while (stack.length > 0) {
        const current = stack.pop();
        if (current === undefined) continue;
        const kids = byParent.get(current) ?? [];
        for (const kid of kids) {
            if (out.has(kid.id)) continue;
            out.add(kid.id);
            stack.push(kid.id);
        }
    }
    return out;
}

/**
 * Move `activeId` to sit at `overId`'s position with a new `parentId`. Implements the dnd-kit
 * Sortable Tree pattern: arrayMove on the flat rows array — siblings preserve their relative
 * order via the array, parent-child structure follows from {@link AdminCategory.parentId}.
 *
 * Cycle-safe: callers are expected to have screened out drops that would parent the active row
 * inside its own subtree (the drag controller does this via {@link collectSubtreeIds}).
 */
export function moveCategory(
    rows: AdminCategory[],
    activeId: number,
    overId: number,
    newParentId: number | null,
): AdminCategory[] {
    const activeIndex = rows.findIndex((r) => r.id === activeId);
    const overIndex = rows.findIndex((r) => r.id === overId);
    if (activeIndex === -1 || overIndex === -1) return rows;
    const updated = rows.slice();
    updated[activeIndex] = { ...updated[activeIndex], parentId: newParentId } as AdminCategory;
    return arrayMove(updated, activeIndex, overIndex);
}

/**
 * Compute a drop projection from the canonical dnd-kit Sortable Tree rules. The active row
 * conceptually lands at `overIndex` (an `arrayMove` on the visible flat list). The depth is
 * derived from the cursor's accumulated horizontal offset, then clamped by the depth of the
 * post-move predecessor and successor so we never produce orphaned indentation.
 *
 * Returns `null` when no legal drop exists (cursor over self, projected parent inside the
 * moving subtree, etc.) so the renderer can hide the indicator instead of showing a bad target.
 */
export function projectDrop(args: {
    flatRows: CategoryTreeRow[];
    activeId: number;
    overId: number;
    dragOffsetX: number;
    indentPx: number;
    movingSubtree: ReadonlySet<number>;
}): { depth: number; parentId: number | null; projectedIndex: number } | null {
    const { flatRows, activeId, overId, dragOffsetX, indentPx, movingSubtree } = args;
    const overIndex = flatRows.findIndex((r) => r.category.id === overId);
    const activeIndex = flatRows.findIndex((r) => r.category.id === activeId);
    if (overIndex === -1 || activeIndex === -1) return null;

    const activeRow = flatRows[activeIndex];
    const reordered = simulateMove(flatRows, activeIndex, overIndex);
    const previous = reordered[overIndex - 1];
    const next = reordered[overIndex + 1];
    const dragDepth = Math.round(dragOffsetX / indentPx);
    const projectedDepth = activeRow.depth + dragDepth;
    const maxDepth = previous === undefined ? 0 : Math.min(previous.depth + 1, MAX_TREE_DEPTH);
    const minDepth = next === undefined ? 0 : next.depth;
    const depth = clampDepth(projectedDepth, minDepth, maxDepth);

    const parentId = resolveParentId({ depth, previous, reordered, overIndex });
    if (parentId !== null && movingSubtree.has(parentId)) return null;
    return { depth, parentId, projectedIndex: overIndex };
}

function simulateMove(items: CategoryTreeRow[], fromIndex: number, toIndex: number): CategoryTreeRow[] {
    if (fromIndex === toIndex) return items;
    const next = items.slice();
    const [moved] = next.splice(fromIndex, 1);
    if (moved === undefined) return items;
    next.splice(toIndex, 0, moved);
    return next;
}

function clampDepth(value: number, minDepth: number, maxDepth: number): number {
    if (value >= maxDepth) return maxDepth;
    if (value < minDepth) return minDepth;
    return value;
}

function resolveParentId(args: {
    depth: number;
    previous: CategoryTreeRow | undefined;
    reordered: CategoryTreeRow[];
    overIndex: number;
}): number | null {
    const { depth, previous, reordered, overIndex } = args;
    if (depth === 0 || previous === undefined) return null;
    if (depth === previous.depth) return previous.category.parentId;
    if (depth > previous.depth) return previous.category.id;
    for (let i = overIndex - 1; i >= 0; i -= 1) {
        const row = reordered[i];
        if (row === undefined) continue;
        if (row.depth === depth - 1) return row.category.id;
    }
    return null;
}
