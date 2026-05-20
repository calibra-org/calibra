import { arrayMove } from "@dnd-kit/sortable";

import type { AdminCategory } from "#/lib/types";

import { type CategoryTreeRow, type DropProjection, MAX_TREE_DEPTH } from "./types";

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
 * Project a drop from two independent inputs:
 *
 *   - Cursor Y inside the hovered row decides sibling order — above or below the target.
 *   - A direction-corrected horizontal drag offset decides whether to nest — dragging at
 *     least one indent step *toward the deeper side* (right under LTR, left under RTL)
 *     flips the projection into the "inside" kind.
 *
 * Operators learn the gesture once: vertical = reorder, horizontal = nest. The horizontal
 * sign already comes in flipped for RTL via the caller, so the math here doesn't know about
 * writing direction at all.
 *
 * Returns `null` for self-drops or projections that would create a cycle.
 */
export function projectDrop(args: {
    flatRows: CategoryTreeRow[];
    activeId: number;
    overId: number;
    positionInRow: number;
    nestOffset: number;
    indentPx: number;
    movingSubtree: ReadonlySet<number>;
}): DropProjection | null {
    const { flatRows, activeId, overId, positionInRow, nestOffset, indentPx, movingSubtree } = args;
    if (overId === activeId) return null;
    const overRow = flatRows.find((r) => r.category.id === overId);
    if (overRow === undefined) return null;

    const canNestInside = overRow.depth < MAX_TREE_DEPTH && !movingSubtree.has(overId);
    const wantsNest = canNestInside && nestOffset >= indentPx;
    const clamped = Math.max(0, Math.min(1, positionInRow));

    let kind: DropProjection["kind"];
    let parentId: number | null;
    let depth: number;
    if (wantsNest) {
        kind = "inside";
        parentId = overId;
        depth = overRow.depth + 1;
    } else {
        kind = clamped < 0.5 ? "above" : "below";
        parentId = overRow.category.parentId;
        depth = overRow.depth;
    }

    /** Cycle guard: the projected parent must not live inside the moving subtree. */
    if (parentId !== null && movingSubtree.has(parentId)) return null;

    return { parentId, depth, kind, targetId: overId };
}

/**
 * Commit a drop: update the active row's `parentId` and splice it into the rows array at the
 * position implied by `kind`. Sibling rank is encoded by array order, so the splice index
 * determines whether the moved row appears before / after / inside the target.
 *
 *   - `above`  → splice immediately before the target row in the rows array.
 *   - `below`  → splice immediately after the target row.
 *   - `inside` → splice at the end of the target's subtree, so the moved row becomes the
 *                target's last visible child.
 *
 * Descendants of the moved row are not relocated in the array — they "follow" the parent via
 * `parentId`, and the flatten pass orders siblings by their relative position in `rows`.
 */
export function moveCategory(
    rows: AdminCategory[],
    activeId: number,
    targetId: number,
    kind: DropProjection["kind"],
    newParentId: number | null,
): AdminCategory[] {
    const activeIndex = rows.findIndex((r) => r.id === activeId);
    const targetIndex = rows.findIndex((r) => r.id === targetId);
    if (activeIndex === -1 || targetIndex === -1) return rows;

    const updated = rows.slice();
    updated[activeIndex] = { ...updated[activeIndex], parentId: newParentId } as AdminCategory;

    let insertIndex: number;
    if (kind === "above") {
        insertIndex = targetIndex;
    } else if (kind === "below") {
        insertIndex = targetIndex + 1;
    } else {
        let endIndex = targetIndex + 1;
        const subtree = new Set<number>([targetId]);
        while (endIndex < updated.length) {
            const row = updated[endIndex];
            if (row !== undefined && row.parentId !== null && subtree.has(row.parentId)) {
                subtree.add(row.id);
                endIndex += 1;
            } else {
                break;
            }
        }
        insertIndex = endIndex;
    }

    /** `arrayMove` operates on the post-removal index space; adjust when active sits before target. */
    const adjusted = activeIndex < insertIndex ? insertIndex - 1 : insertIndex;
    return arrayMove(updated, activeIndex, adjusted);
}
