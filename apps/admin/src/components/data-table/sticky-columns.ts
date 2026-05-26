import type { CSSProperties } from "react";

import { cn } from "#/lib/utils";

/**
 * Sticky-column business logic for the admin DataTable. Lives in its own file so the data-table
 * stays focused on render mechanics and consumers can `import { … } from "./sticky-columns"` when
 * they need to know whether a given column is pinned, where it sits, and which one is the edge
 * that should draw the scroll shadow.
 *
 * Design notes:
 *
 * - **Inline-axis only.** All "start" / "end" terms refer to the *inline* axis, so RTL flips for
 *   free via CSS logical properties (`inset-inline-start`). Don't translate to left/right.
 *
 * - **Offsets are computed from explicit column widths.** Every sticky column must declare a
 *   `size` in its ColumnDef. The plan accumulates widths of earlier-pinned columns on the same
 *   side so the second pinned column lands at `inset-inline-start: <first.size>px`, the third
 *   at `<first.size + second.size>px`, and so on.
 *
 * - **Only the edge column draws the shadow.** When several adjacent columns are pinned to the
 *   same side, only the one closest to the scrollable band is "the edge". The interior columns
 *   sit *behind* the edge column visually, so painting a shadow on each of them produces the
 *   stack-of-receipts effect the user reported — we mark only the edge column with
 *   `data-sticky-edge-position="edge"` and let the data-table render the shadow exclusively
 *   when that attribute is present.
 */

export type StickySide = "start" | "end";

export interface StickyConfig {
    /** Column ids pinned to the inline-start edge, in display order. */
    start?: string[];
    /** Column ids pinned to the inline-end edge, in display order. */
    end?: string[];
}

export interface StickyPlacement {
    side: StickySide;
    /** Pixels offset from the pinned side. 0 for the first pinned column on each side. */
    offsetPx: number;
    /**
     * `true` when this column is the last pinned one on its side before transitioning to
     * scrollable content. Only edge columns paint the scroll shadow; interior pinned columns
     * sit behind the edge and don't need their own shadow.
     */
    isEdge: boolean;
    /** Z-index applied to the cell. Higher = wins stacking ties; the edge wins over interior. */
    zIndex: number;
}

export type StickyPlan = ReadonlyMap<string, StickyPlacement>;

/** Minimum column descriptor needed to plan stickiness. */
export interface PlannableColumn {
    id: string;
    /** Explicit width in pixels. Sticky columns without an explicit size land at offset 0. */
    size?: number | undefined;
    /**
     * Optional per-column override. When set on a `meta.sticky` value, the column joins the
     * sticky cluster even if it's not in the {@link StickyConfig} list. Used for tests + opt-in.
     */
    metaSticky?: StickySide | undefined;
}

const Z_EDGE_CELL = 11;
const Z_INTERIOR_CELL = 10;
const Z_EDGE_HEADER = 21;
const Z_INTERIOR_HEADER = 20;

/**
 * Resolves a side ordering from {@link StickyConfig} into a list of column ids that actually
 * exist among the visible columns, in display order. Columns referenced in the config but
 * absent from the visible set are dropped (e.g. column visibility toggled them off).
 */
function visibleStickyIds(visibleColumns: PlannableColumn[], wanted: string[] | undefined, side: StickySide): string[] {
    const visibleIds = new Set(visibleColumns.map((c) => c.id));
    const result: string[] = [];
    if (wanted !== undefined) {
        for (const id of wanted) {
            if (visibleIds.has(id)) result.push(id);
        }
    }
    /** Any column with `meta.sticky === side` that wasn't explicitly listed joins the cluster. */
    for (const col of visibleColumns) {
        if (col.metaSticky === side && !result.includes(col.id)) result.push(col.id);
    }
    return result;
}

/**
 * Build the sticky plan for the table's currently-visible columns. Returns a Map keyed by
 * column id with `{ side, offsetPx, isEdge, zIndex }`. The data-table layer reads this map to
 * apply CSS offsets, edge-only shadows, and z-index stacking.
 *
 * Edge resolution:
 *   - start side: the LAST column in the start cluster (highest accumulated offset) is the edge
 *   - end side: the FIRST column in the end cluster (encountered when scanning from the
 *     scrollable band toward the end edge) is the edge
 */
export function buildStickyPlan(visibleColumns: PlannableColumn[], config: StickyConfig): StickyPlan {
    const plan = new Map<string, StickyPlacement>();
    const byId = new Map(visibleColumns.map((c) => [c.id, c] as const));

    const startIds = visibleStickyIds(visibleColumns, config.start, "start");
    let startOffset = 0;
    for (let i = 0; i < startIds.length; i += 1) {
        const id = startIds[i];
        const col = byId.get(id);
        const size = col?.size ?? 0;
        const isEdge = i === startIds.length - 1;
        plan.set(id, {
            side: "start",
            offsetPx: startOffset,
            isEdge,
            zIndex: isEdge ? Z_EDGE_CELL : Z_INTERIOR_CELL,
        });
        startOffset += size;
    }

    const endIds = visibleStickyIds(visibleColumns, config.end, "end");
    let endOffset = 0;
    for (let i = endIds.length - 1; i >= 0; i -= 1) {
        const id = endIds[i];
        const col = byId.get(id);
        const size = col?.size ?? 0;
        const isEdge = i === 0;
        plan.set(id, {
            side: "end",
            offsetPx: endOffset,
            isEdge,
            zIndex: isEdge ? Z_EDGE_CELL : Z_INTERIOR_CELL,
        });
        endOffset += size;
    }

    return plan;
}

/**
 * Tailwind classes applied to a sticky cell (`<td>`). Inline `<th>` headers use
 * {@link stickyHeaderClasses} instead — they need a higher z-index and a different background
 * so the header row stays opaque when scrolled under.
 */
const STICKY_CELL_BASE = "sticky bg-inherit";
const STICKY_HEADER_BASE = "sticky bg-muted/95 supports-[backdrop-filter]:bg-muted/70 backdrop-blur";

/**
 * Inline-axis shadow that paints *only* when the cell is the edge AND the scroll container
 * has content hidden in the corresponding direction (data attributes set by the parent's
 * scroll-edge watcher).
 *
 * **Shadow is start-side only.** The end-side cluster (Actions / overflow buttons) reads
 * unbalanced when the operator scrolls and a shadow paints next to it — the actions sit
 * visually anchored to the inline-end edge already, and the gradient adds noise without
 * orientation value. Only the start-side edge column draws the shadow.
 */
const SHADOW_START_EDGE =
    "after:pointer-events-none after:absolute after:inset-y-0 after:end-0 after:w-2 after:bg-gradient-to-l after:from-foreground/8 after:to-transparent after:opacity-0 after:transition-opacity after:rtl:bg-gradient-to-r [&[data-sticky-edge-position='edge'][data-sticky-edge='start-shadow']]:after:opacity-100";

export interface StickyCellAttrs {
    className: string;
    style: CSSProperties;
    /** Data attributes the data-table merges onto the cell element. */
    dataAttrs: {
        "data-sticky": StickySide;
        "data-sticky-edge-position": "edge" | "interior";
    };
}

/**
 * Resolve render-time class + style + data attrs for a sticky cell (body row). Returns
 * `undefined` for non-sticky columns so consumers can `cell == null ? defaultClass : merge(...)`.
 */
export function resolveStickyCell(placement: StickyPlacement | undefined): StickyCellAttrs | undefined {
    if (placement === undefined) return undefined;
    const inset = `${placement.offsetPx}px`;
    return {
        /**
         * Don't emit `relative` here. The data-table cell already adds `relative` from its base
         * class string, and tailwind-merge collapses two position utilities to the LAST one —
         * which used to be `relative`, silently overriding `sticky` and making the cell not
         * actually pin. `position: sticky` *is* itself a positioned context, so the cell's
         * `before:` pseudo-divider still anchors correctly when we drop `relative` from the
         * sticky helper and apply `sticky` LAST in the merge.
         */
        className: cn(STICKY_CELL_BASE, placement.side === "start" && SHADOW_START_EDGE),
        style: {
            insetInlineStart: placement.side === "start" ? inset : undefined,
            insetInlineEnd: placement.side === "end" ? inset : undefined,
            zIndex: placement.zIndex,
        },
        dataAttrs: {
            "data-sticky": placement.side,
            "data-sticky-edge-position": placement.isEdge ? "edge" : "interior",
        },
    };
}

/** Header counterpart — same offsets but a higher z-index + opaque header background. */
export function resolveStickyHeader(placement: StickyPlacement | undefined): StickyCellAttrs | undefined {
    if (placement === undefined) return undefined;
    const inset = `${placement.offsetPx}px`;
    return {
        className: cn(STICKY_HEADER_BASE, placement.side === "start" && SHADOW_START_EDGE),
        style: {
            insetInlineStart: placement.side === "start" ? inset : undefined,
            insetInlineEnd: placement.side === "end" ? inset : undefined,
            zIndex: placement.isEdge ? Z_EDGE_HEADER : Z_INTERIOR_HEADER,
        },
        dataAttrs: {
            "data-sticky": placement.side,
            "data-sticky-edge-position": placement.isEdge ? "edge" : "interior",
        },
    };
}
