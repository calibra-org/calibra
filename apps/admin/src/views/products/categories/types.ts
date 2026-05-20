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
 * Pending drop projection emitted by the drag controller. The renderer reads this to (a) draw
 * the projected indent on the active row, (b) flag the projected parent for the "drop as child"
 * halo, and (c) surface the live caption near the cursor.
 */
export interface DropProjection {
    /** Target parent id after drop, or `null` for top-level placement. */
    parentId: number | null;
    /** 0-based depth the row will live at after the drop. Capped by {@link MAX_TREE_DEPTH}. */
    depth: number;
    /** Whether the projection nests the active row under {@link parentId} (`inside`) or keeps it as a sibling (`reorder`). */
    kind: "inside" | "reorder";
}

/** Hard ceiling on visible nesting. Past this point the tree gets unreadable; keep it sensible. */
export const MAX_TREE_DEPTH = 5;

/** Pixels of horizontal indent applied per depth level. Drag-to-indent uses the same constant. */
export const TREE_INDENT_PX = 22;
