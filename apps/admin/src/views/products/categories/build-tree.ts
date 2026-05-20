import type { Locale } from "@calibra/shared/i18n";

import type { AdminCategory } from "#/lib/types";

import { type CategoryTreeRow, MAX_TREE_DEPTH } from "./types";

/**
 * Build a depth-aware ordered list from the flat category response. Top-level rows are sorted
 * by name in the active locale, and each subtree is sorted the same way. Subtrees of collapsed
 * parents are omitted from the flat output so the renderer can iterate one array.
 *
 * `expandedIds` controls which subtrees are present; pass an empty set to collapse everything.
 * Pass `null` to expand every node (useful for parent-picker dropdowns that always need the
 * full tree visible).
 */
export function flattenCategoryTree(
    rows: AdminCategory[],
    expandedIds: ReadonlySet<number> | null,
    locale: Locale,
): CategoryTreeRow[] {
    const byParent = new Map<number | null, AdminCategory[]>();
    for (const row of rows) {
        const bucket = byParent.get(row.parentId) ?? [];
        bucket.push(row);
        byParent.set(row.parentId, bucket);
    }
    for (const bucket of byParent.values()) {
        bucket.sort((a, b) => collator(locale).compare(a.name[locale] ?? "", b.name[locale] ?? ""));
    }

    const descendantCount = countDescendants(rows);
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

/**
 * Count descendants (own children + all transitive descendants) for every category id in `rows`.
 * One linear pass over `rows`, one DFS per root — fine for the few-hundred-category ceiling the
 * admin panel realistically renders.
 */
function countDescendants(rows: AdminCategory[]): Map<number, number> {
    const byParent = new Map<number | null, AdminCategory[]>();
    for (const row of rows) {
        const bucket = byParent.get(row.parentId) ?? [];
        bucket.push(row);
        byParent.set(row.parentId, bucket);
    }
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
    for (const row of rows) count(row.id);
    return cache;
}

/**
 * Find the next legal `parentId` for a node dropped at `(overIndex, projectedDepth)` inside the
 * flat tree. The projected parent is the closest preceding row whose depth is one less than
 * the projection. Returns `null` for top-level placement.
 *
 * Caller is responsible for blocking drops onto descendants of the dragged node — that check
 * lives in the drag controller because it needs access to the *original* subtree, not the
 * post-drop projection.
 */
export function resolveProjectedParent(
    flatRows: CategoryTreeRow[],
    overIndex: number,
    projectedDepth: number,
): { parentId: number | null; depth: number } {
    const clampedDepth = Math.max(0, Math.min(projectedDepth, MAX_TREE_DEPTH));
    if (clampedDepth === 0) return { parentId: null, depth: 0 };
    for (let i = overIndex; i >= 0; i -= 1) {
        const row = flatRows[i];
        if (row === undefined) continue;
        if (row.depth === clampedDepth - 1) return { parentId: row.category.id, depth: clampedDepth };
    }
    return { parentId: null, depth: 0 };
}

/**
 * IDs of `nodeId` and every descendant. Used by the drag controller to (a) hide the moving
 * subtree from the flat list while dragging, and (b) reject self-parent / cycle drops.
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
 * Move `nodeId` so its new parent is `newParentId`. Returns a new array — the source list is
 * left untouched so callers can roll back if the server mutation fails.
 *
 * `siblings` ordering inside a parent is recomputed by the renderer's locale-aware sort, so we
 * deliberately do not thread a position index here. When the API grows a `display_order` field
 * we'll layer that in by writing an explicit `order` column instead of relying on name.
 */
export function reparentCategory(rows: AdminCategory[], nodeId: number, newParentId: number | null): AdminCategory[] {
    return rows.map((row) => (row.id === nodeId ? { ...row, parentId: newParentId } : row));
}

/**
 * Locale-aware string comparator. Persian (`fa`) uses the `fa-IR` collation; everything else
 * defaults to the locale's own collation. Cached because `Intl.Collator` is non-trivial to
 * construct on every compare callback.
 */
const collators = new Map<Locale, Intl.Collator>();
function collator(locale: Locale): Intl.Collator {
    const cached = collators.get(locale);
    if (cached !== undefined) return cached;
    const next = new Intl.Collator(locale === "fa" ? "fa-IR" : locale, { sensitivity: "base", numeric: true });
    collators.set(locale, next);
    return next;
}
