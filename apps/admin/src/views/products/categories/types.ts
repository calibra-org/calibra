import type { AdminCategory } from "#/lib/types";

/**
 * Tree-aware projection of an {@link AdminCategory}. The data layer hands us a flat list keyed
 * by `parentId`; the view layer wants a depth-aware ordered list that the drag-and-drop tree
 * can render and reshape without an extra walk per render. {@link flattenCategoryTree} fills in
 * `depth`, `parentChain`, and `hasChildren` once per data change.
 */
export interface CategoryTreeRow {
    category: AdminCategory;
    depth: number;
    parentChain: number[];
    hasChildren: boolean;
    /**
     * Pre-computed descendant count (own children + grandchildren + …). Used in the inspector
     * preview and to decide whether a subtree can be safely deleted without orphaning rows.
     */
    descendantCount: number;
    /**
     * Visual flag — true when this row is currently expanded so its children render below it.
     * The expand/collapse state lives in the view, not in the data, so a refetch never wipes it.
     */
    isExpanded: boolean;
}

/**
 * Pending drop projection emitted by the drag controller. We don't move the tree until the drop
 * actually commits, but we still need to feed the renderer something to draw the drop indicator
 * and the projected indentation while the row hovers.
 */
export interface DropProjection {
    /** Target parent id, or `null` for top-level placement. */
    parentId: number | null;
    /** 0-based depth the row will live at after the drop. Capped by {@link MAX_TREE_DEPTH}. */
    depth: number;
    /**
     * Drop kind — `between` slides the row in between its new siblings; `inside` reparents it
     * as the first child of `parentId`.
     */
    kind: "between" | "inside";
}

/** Hard ceiling on visible nesting. Past this point the tree gets unreadable; keep it sensible. */
export const MAX_TREE_DEPTH = 5;

/** Pixels of horizontal indent applied per depth level. Drag-to-indent uses the same constant. */
export const TREE_INDENT_PX = 22;
